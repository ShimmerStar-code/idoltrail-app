<template>
  <PageLayout>
    <view class="page">
      <scroll-view scroll-y class="content">
        <view class="head">
          <text class="head-title">{{ title }}</text>
          <text class="head-meta">版本 {{ version }}</text>
        </view>
        <view class="text-wrap">
          <text class="text">
            <text
              v-for="(seg, i) in segments"
              :key="i"
              :class="{ 'text-bold': seg.bold }"
            >{{ seg.text }}</text>
          </text>
        </view>
        <!-- 底部固定操作区：协议页也是隐私弹窗的跳转落点，必须能一键同意，
             否则用户在弹窗里点「查看政策」过来后没有任何返回同意的入口 -->
        <view class="footer">
          <view class="footer-info">
            <text class="footer-tip">{{ statusText }}</text>
            <text v-if="agreedVersion" class="footer-sub">已同意版本：{{ agreedVersion }}</text>
          </view>
          <view
            class="footer-btn"
            :class="{ 'footer-btn--done': agreed }"
            @tap="onAgree"
          >
            <text class="footer-btn-text">{{ agreed ? '已同意' : agreeBtnText }}</text>
          </view>
        </view>
      </scroll-view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import PageLayout from '@/components/PageLayout/index.vue'
import { authApi } from '@/api/auth'
import { userApi } from '@/api/user'
import { useUserStore } from '@/stores/user'
import { getEffectiveAgreement } from '@/utils/agreementContent'
import {
  savePrivacyConsent,
  hasPrivacyConsent,
  getPrivacyVersion,
  getPrivacyConsentAt,
  syncNativePrivacyAgree,
} from '@/utils/privacy'
import type { AgreementRecord } from '@/types/auth'

const type = ref('user_agreement')
const userStore = useUserStore()

/**
 * 协议正文与版本取自**当前生效版本**（服务端优先，包内兜底）。
 *
 * refreshTick 只是为了让 onShow 时能重新取值：生效版本在 App 启动时可能被
 * 服务端更新，页面停留期间不重新计算就会显示旧版本。
 */
const refreshTick = ref(0)
const doc = computed(() => {
  void refreshTick.value
  return getEffectiveAgreement(type.value)
})

const title = computed(() => doc.value.title)
const version = computed(() => doc.value.version)
const content = computed(() => doc.value.content)

/**
 * 把协议正文切成「普通 / 强调」片段。
 *
 * 正文里用 **xxx** 标注需要强调的条款（如"不会"、"必要"），源文件是 TypeScript 模板字符串，
 * 不是 Markdown 渲染管线，直接输出会把星号原样显示给用户。这里做一次轻量解析：
 * 成对的 ** 之间的内容用粗体渲染，其余原样。
 */
const segments = computed(() => {
  const raw = content.value
  const out: { text: string; bold: boolean }[] = []
  const re = /\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) out.push({ text: raw.slice(last, m.index), bold: false })
    out.push({ text: m[1], bold: true })
    last = m.index + m[0].length
  }
  if (last < raw.length) out.push({ text: raw.slice(last), bold: false })
  // 兜底：没有强调标记时也要保证有一整段文本
  if (!out.length) out.push({ text: raw, bold: false })
  return out
})

/** 已同意的记录（后端签署记录优先，未登录时隐私政策退回本地记录） */
const record = ref<AgreementRecord | null>(null)

const isPrivacy = computed(() => type.value === 'privacy_policy')

/** 已同意态：隐私政策看本地同意记录，用户协议看账号的协议补签状态 */
const agreed = computed(() => {
  // 隐私同意状态存在 storage 里，不是响应式数据，靠 refreshTick 触发重算
  void refreshTick.value
  if (record.value) return true
  if (isPrivacy.value) return hasPrivacyConsent()
  return userStore.isLoggedIn && !userStore.agreementRequired
})

/** 页尾展示的"已同意版本" */
const agreedVersion = computed(() => {
  if (record.value) return record.value.version
  if (isPrivacy.value && hasPrivacyConsent()) return getPrivacyVersion()
  return ''
})

/** 同意按钮文案：按协议类型区分，商店审核要求按钮语义明确 */
const agreeBtnText = computed(() =>
  isPrivacy.value ? '同意隐私政策' : '同意用户协议',
)

/** 页尾状态文案：展示用户已同意的时间与版本 */
const statusText = computed(() => {
  void refreshTick.value
  const at = record.value
    ? record.value.source === 'local'
      ? record.value.accepted_at
      : formatTime(record.value.accepted_at)
    : isPrivacy.value && hasPrivacyConsent()
      ? formatTime(getPrivacyConsentAt())
      : ''
  if (agreed.value) {
    return at
      ? `您已于 ${at} 同意本协议`
      : '您已同意本协议'
  }
  return '您尚未同意本协议，同意后方可使用相关功能'
})

/** 后端返回 RFC3339 时间，这里转成本地可读格式 */
function formatTime(raw: string | number) {
  if (!raw) return ''
  const d = typeof raw === 'number' ? new Date(raw) : new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * 拉取该用户对当前协议的签署记录。
 *
 * 后端 GET /user/agreements 返回**全部**协议类型的签署历史（同意时间、版本、来源），
 * 这里只取当前协议类型最近的一条用于页尾展示。
 */
async function loadAgreementRecord() {
  if (userStore.isLoggedIn) {
    try {
      const res = await userApi.agreements(1, 50)
      const hit = res.list.find((i) => i.agreement_type === type.value)
      if (hit) {
        record.value = hit
        return
      }
    } catch (e) {
      console.warn('[AgreementDetail] 拉取签署记录失败', e)
    }
  }
  // 未登录：隐私政策只能用本地记录（未登录时无法签署用户协议）
  if (isPrivacy.value && hasPrivacyConsent()) {
    record.value = {
      id: 0,
      agreement_type: 'privacy_policy',
      version: getPrivacyVersion(),
      source: 'local',
      accepted_at: formatTime(getPrivacyConsentAt()),
      device_type: '',
      platform: '',
    }
  } else {
    record.value = null
  }
}

onLoad((q: any) => {
  if (q?.type) type.value = q.type
  // 动态设置导航栏标题（替换静态的「协议」）
  uni.setNavigationBarTitle({ title: title.value })
  // 协议页期间禁止全局浮层自动弹出（PrivacyPopup / LoginModal 各自页面都挂了一份实例，
  // 不抑制的话从弹窗跳过来会连弹两遍）
  userStore.suspendGlobalOverlay()
  void loadAgreementRecord()
})

onShow(() => {
  // 生效版本可能在后台被服务端更新过，回到页面时重新取一次
  refreshTick.value++
})

onUnload(() => {
  // 解除抑制；若用户仍未同意隐私政策，回到上一页时要把弹窗重新拉起来
  userStore.resumeGlobalOverlay()
  if (!hasPrivacyConsent()) {
    userStore.openPrivacyPopup('app_launch')
  }
})

async function onAgree() {
  if (agreed.value) return

  // 隐私政策：先落本地同意状态，这样回退到弹窗时无需重复征求
  if (isPrivacy.value) {
    // 回写原生运行时，保证与 DCloud 原生层的同意状态一致（避免下次冷启动重复弹原生弹窗）
    syncNativePrivacyAgree()
    savePrivacyConsent()
    // 通知 App.vue 可以开始推送初始化 / 会话恢复了
    userStore.markPrivacyConsented()
    // 同意状态写在 storage 里，页尾的「已同意」不是响应式的，
    // 这里同步补一条本地记录并手动触发一次刷新。
    record.value = {
      id: 0,
      agreement_type: 'privacy_policy',
      version: getPrivacyVersion(),
      source: 'local',
      accepted_at: formatTime(getPrivacyConsentAt()),
      device_type: '',
      platform: '',
    }
    refreshTick.value++
  }

  // 已登录用户需要把协议版本上报后端，否则账号侧仍是「未签」状态
  if (userStore.isLoggedIn) {
    uni.showLoading({ title: '提交中' })
    try {
      await authApi.acceptAgreement(type.value, version.value)
      userStore.setAgreementOK()
    } catch (e: any) {
      uni.hideLoading()
      uni.showToast({ title: e?.message || '提交失败，请重试', icon: 'none' })
      return
    }
    uni.hideLoading()
  } else if (!isPrivacy.value) {
    // 用户协议必须登录后签署（后端要记录 uid / IP / 设备）
    uni.showToast({ title: '请先登录后同意用户协议', icon: 'none' })
    return
  }

  // 刷新页尾的"已同意时间与版本"
  await loadAgreementRecord()

  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.reLaunch({ url: '/pages/home/index' })
  }
}
</script>

<style scoped>
.page {
  background: #fff;
  min-height: 100vh;
}
.content {
  width: 100%;
  height: 100vh;
  box-sizing: border-box;
}
.head {
  padding: 40rpx 30rpx 0;
}
.head-title {
  display: block;
  font-size: 40rpx;
  font-weight: 600;
  color: #222;
}
.head-meta {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #999;
}
.text-wrap {
  width: 100%;
  /* 底部留出固定操作区的高度，避免最后一行正文被 footer 盖住 */
  padding: 24rpx 30rpx 200rpx;
  box-sizing: border-box;
}
.text {
  display: block;
  width: 100%;
  font-size: 28rpx;
  line-height: 1.8;
  color: #555;
  /* 协议正文含大量中英文与分隔线，不能用 break-all，否则单词会被拦腰折断 */
  white-space: pre-wrap;
  word-break: break-word;
}
/* 正文里 **xxx** 标注的强调条款 */
.text-bold {
  font-weight: 600;
  color: #333;
}
.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 20rpx 30rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid rgba(236, 236, 236, 1);
}
.footer-info {
  flex: 1;
  min-width: 0;
}
.footer-tip {
  display: block;
  font-size: 24rpx;
  color: #666;
}
.footer-sub {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #999;
}
.footer-btn {
  flex-shrink: 0;
  padding: 16rpx 48rpx;
  border-radius: 999rpx;
  background: #3c374b;
}
.footer-btn--done {
  background: #ccc;
}
.footer-btn-text {
  font-size: 28rpx;
  color: #fff;
}
</style>
