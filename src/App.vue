<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'
import { watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import { setAuthExpiredHandler, setTokenRefreshedHandler, refreshSessionIfStale } from '@/utils/request'
import { syncDefaultAvatars } from '@/utils/defaultAvatar'
import { hasPrivacyConsent, getPrivacyVersion, isNativePrivacyAgreed, savePrivacyConsent } from '@/utils/privacy'
import { syncAgreementsFromServer } from '@/utils/agreementContent'
import {
  initPush,
  syncPushToken,
  flushPendingPushClick,
  checkNotifyPermissionHint,
} from '@/composables/usePush'
import { useNotificationStore } from '@/stores/notification'

const userStore = useUserStore()
const appStore = useAppStore()
const notifStore = useNotificationStore()

// 401 + refresh 失败时由 request.ts 回调；注入式避开 request ↔ userStore 循环依赖
setAuthExpiredHandler(() => {
  userStore.handleSessionExpired()
})

// 续期成功后同步 store 的内存 token 副本（storage 才是权威来源）
setTokenRefreshedHandler(() => {
  userStore.syncTokensFromStorage()
})

/**
 * 取得隐私政策同意之后才允许做的事情。
 *
 * ⚠️ 这一层是小米 / 华为应用商店的硬性要求：
 * 「用户同意隐私政策前不得收集任何个人信息、不得读取设备标识、不得申请敏感权限」。
 * 下面这几件事在"同意前"都会触碰设备标识，因此必须整体后置：
 *   · initPush() —— plus.push.addEventListener 会拉起 uni-push 厂商通道 SDK，
 *     小米 / 华为 SDK 在初始化阶段就会读设备标识去注册通道；
 *   · checkNotifyPermissionHint() —— 读系统信息判断 Android 版本；
 *   · bootstrapSession() —— 带 token 请求后端，附带设备与 IP 信息；
 *   · checkAndShowDisclaimer() —— 免责声明弹窗若与隐私弹窗同时弹会叠成两层 mask，
 *     顺序上应该在隐私告知之后。
 */
let consentBootstrapped = false
async function afterPrivacyConsent() {
  if (consentBootstrapped) return
  consentBootstrapped = true
  console.log('[App] privacy consent granted, start post-consent init')

  // 推送（uni-push 2.0）。未安装插件 / 开关关闭时为 no-op。
  // 通知触达的唯一通道：前台由 pushMessageReceived 回调刷新，
  // 后台由系统通知栏承接，客户端收到后回查 /notifications。
  initPush()
  checkNotifyPermissionHint()

  // 仅在 storage 里有 access token 时做一次轻量验证:
  //   - 200 → 保持登录态
  //   - 401 → request.ts 自动 refresh;refresh 失败由 notifySessionExpired 弹强制 modal
  //   - 没 token → 什么都不做,保持未登录态,等用户主动触发
  // App 端没有 wx.login 这类免密登录手段,**绝不**做静默登录。
  const ok = await userStore.bootstrapSession()
  console.log('[App] bootstrapSession', ok, 'agreementRequired=', userStore.agreementRequired)

  // 免责声明（首次启动）。放在隐私同意之后，避免两个弹窗叠在一起。
  appStore.checkAndShowDisclaimer()
}

// 隐私同意状态变化（老用户启动时已是 true）→ 触发上面的初始化
watch(
  () => userStore.privacyGranted,
  (granted: boolean) => {
    if (granted) void afterPrivacyConsent()
  },
  { immediate: true },
)

onLaunch(async () => {
  console.log('[App] Launch')

  // 0) 默认头像本地化：每天首次冷启动静默从 OSS 覆盖一份到本地缓存。
  //    包内已有一份兜底，本次调用不 await、不阻塞启动；失败就用包内那份。
  //    只下载静态图片，不带任何设备标识，属于"同意前可做"的最小动作。
  syncDefaultAvatars()

  // 1) 隐私合规：首次启动 / 协议版本升级时必须先取得用户同意，
  //    在此之前业务层会拦截一切需要系统授权的 API（定位、通知等），
  //    推送 SDK 初始化、会话恢复也都挂在这个同意之后（见 afterPrivacyConsent）。
  //
  //    ⚠️ 首启的"同意"实际发生在**原生层**（src/androidPrivacy.json 的 prompt:"template"，
  //    原生模板弹窗在 splash 界面挡住应用，用户点同意后才加载原生插件与三方 SDK）。
  //    JS 跑到这里时原生那边已经是"已同意"→ 只需同步本地状态，
  //    **不要再弹自绘弹窗**：自绘弹窗出现在 SDK 初始化之后，会被检测引擎
  //    判成「未经用户同意即收集个人信息」（引擎1/引擎3 的报法）。
  if (!hasPrivacyConsent()) {
    if (isNativePrivacyAgreed()) {
      console.log('[App] 原生隐私弹窗已取得同意，同步本地状态，不再弹自绘弹窗')
      savePrivacyConsent()
      userStore.markPrivacyConsented()
    } else {
      userStore.openPrivacyPopup('app_launch')
    }
  }

  // 2) 拉取服务端的最新协议正文与版本号（权威来源是服务端，包内那份只是兜底）。
  //    不 await、不阻塞启动：
  //      · 拉取失败（离线 / 后端未部署）→ 沿用包内版本，静默降级；
  //      · 拉到更新版本 → 隐私政策版本变化，此前对旧版本的同意失效，需要重新征求。
  //    同意状态与版本号的耦合见 utils/agreementContent.ts 与 utils/privacy.ts。
  void syncAgreementsFromServer()
    .then((r) => {
      if (!r.fetched || !r.changed.length) return
      console.log('[App] 协议版本已更新：', r.changed.join(','))
      if (!r.privacyChanged) return
      if (!getPrivacyVersion()) {
        // 用户此前从未同意过：隐私弹窗已经开着，用户点「同意」时记录的就是
        // 当前生效版本，不需要再弹一次（否则会连弹两遍）。
        return
      }
      // 用户曾同意过，但同意的是旧版本 → 该同意已随版本更新失效，重新征求。
      userStore.invalidatePrivacyConsent()
      userStore.openPrivacyPopup('policy_updated')
    })
    .catch((e) => console.warn('[App] 同步协议版本失败', e))
})

onShow(async () => {
  // 回到前台：补一次 cid 上报（厂商通道在冷启动后可能才真正注册成功），
  // 并把冷启动时缓存的「通知点击」补跳掉。
  // 未取得隐私政策同意前不得上报 cid（会带设备标识），这里直接跳过。
  if (hasPrivacyConsent()) {
    await syncPushToken()
  }
  // 滑动续期：距上次续期满 24 小时就主动换一次 token，
  // 把 refresh 的有效期重置为「当天 + 60 天」—— 只要 60 天内打开过 App，
  // 登录态就始终有效；超过 60 天没打开才需要重新登录。
  // 续期失败不阻断：后续请求会走 401 → 强制登录流程。
  if (hasPrivacyConsent() && userStore.isLoggedIn) {
    void refreshSessionIfStale()
  }
  flushPendingPushClick()
  // 通知兜底同步：uni-push 只在「收到推送的那一瞬间」触发前台回调，
  // 而 VITE_PUSH_ENABLED=false / 插件缺失时回调根本不会注册（此时无任何实时通道）。
  // 因此回前台固定回查一次通知接口，保证角标不会长时间失真。
  if (userStore.isLoggedIn) notifStore.refreshAfterPush()
  console.log('[App] Show')
})

onHide(() => {
  // 进后台由系统通知栏承接触达，无需任何额外动作。
  // 原先此处会断开通知 WebSocket —— 该通道已随方案调整下线。
  console.log('[App] Hide')
})
</script>

<template>
  <!--
    全局 LoginModal / PrivacyPopup 不在这里挂载（App.vue 的 template 不参与页面栈渲染），
    由 src/components/PageLayout/index.vue 在每个页面里挂一次。
  -->
  <view class="app-root" />
</template>

<style>
/* 全局样式 */

/* 强制设置所有全局弹窗的 z-index，确保覆盖页面 header (z-index: 100) */
.disclaimer-popup-high-zindex,
.login-popup-high-zindex,
.privacy-popup-high-zindex,
.notification-popup-high-zindex {
  z-index: 9999 !important;
}

page .uni-popup {
  z-index: 9999 !important;
}

/*
 * uni 内置 toast / modal 在 H5 端只有 z-index 999（见 node_modules/@dcloudio/uni-h5/style/api/*.css），
 * 会被上面 9999 的业务遮罩完全盖住：登录框里报验证码错误「只有日志没有界面提示」、
 * CityPicker 的定位授权 uni.showModal 点了没反应，都是这个原因。
 *
 * 系统级提示必须盖在业务遮罩之上，这里统一提到 10000。
 * 注意不能加 page 前缀：uni-toast / uni-modal 挂在 body 下，不在 uni-page-body 内。
 * App 端走原生实现（没有这两个标签），规则自然不生效。
 */
uni-toast,
uni-modal {
  z-index: 10000 !important;
}
</style>
