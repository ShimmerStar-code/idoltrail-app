<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import { setAuthExpiredHandler } from '@/utils/request'
import { syncDefaultAvatars } from '@/utils/defaultAvatar'
import { hasPrivacyConsent } from '@/utils/privacy'
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

onLaunch(async () => {
  console.log('[App] Launch')

  // 0) 默认头像本地化：每天首次冷启动静默从 OSS 覆盖一份到本地缓存。
  //    包内已有一份兜底，本次调用不 await、不阻塞启动；失败就用包内那份。
  syncDefaultAvatars()

  // 1) 隐私合规：首次启动 / 协议版本升级时必须先取得用户同意，
  //    在此之前业务层会拦截一切需要系统授权的 API（定位、通知等）。
  if (!hasPrivacyConsent()) {
    userStore.openPrivacyPopup('app_launch')
  }

  // 2) 初始化推送（uni-push 2.0）。未安装插件 / 开关关闭时为 no-op。
  //    通知触达的唯一通道：前台由 pushMessageReceived 回调刷新，
  //    后台由系统通知栏承接，客户端收到后回查 /notifications。
  initPush()
  checkNotifyPermissionHint()

  // 3) 仅在 storage 里有 access token 时做一次轻量验证:
  //   - 200 → 保持登录态
  //   - 401 → request.ts 自动 refresh;refresh 失败由 notifySessionExpired 弹强制 modal
  //   - 没 token → 什么都不做,保持未登录态,等用户主动触发
  // App 端没有 wx.login 这类免密登录手段,**绝不**做静默登录。
  const ok = await userStore.bootstrapSession()
  console.log('[App] bootstrapSession', ok, 'agreementRequired=', userStore.agreementRequired)

  // 4) 检查并显示免责声明（首次启动）
  appStore.checkAndShowDisclaimer()
})

onShow(async () => {
  // 回到前台：补一次 cid 上报（厂商通道在冷启动后可能才真正注册成功），
  // 并把冷启动时缓存的「通知点击」补跳掉。
  await syncPushToken()
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
