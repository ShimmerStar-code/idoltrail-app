<template>
  <uni-popup
    ref="popupRef"
    type="center"
    :mask-click="false"
    background-color="transparent"
    class="login-popup-high-zindex"
    @change="onPopupChange"
  >
    <view class="login-modal">
      <!-- 关闭按钮：仅在 dismissible 模式显示 -->
      <view v-if="dismissible" class="close-btn" @click="onClose">×</view>

      <image class="logo" src="/static/logo.png" mode="aspectFit" />
      <text class="title">登录 idoltrail</text>
      <text class="subtitle">登录后可订阅偶像、活动提醒、收藏等</text>

      <!-- 手机号 -->
      <view class="field">
        <text class="field-prefix">+86</text>
        <input
          class="field-input"
          type="number"
          maxlength="11"
          placeholder="请输入手机号"
          placeholder-class="field-ph"
          :value="phone"
          @input="onPhoneInput"
        />
      </view>

      <!-- 验证码 -->
      <view class="field">
        <input
          class="field-input"
          type="number"
          maxlength="6"
          placeholder="请输入验证码"
          placeholder-class="field-ph"
          :value="code"
          @input="onCodeInput"
          @confirm="onLogin"
        />
        <text
          class="field-action"
          :class="{ 'field-action--disabled': !canSendCode }"
          @click="onSendCode"
        >{{ sendCodeText }}</text>
      </view>

      <!-- 频控 / 发送失败的提示 -->
      <text v-if="sendError" class="send-error">{{ sendError }}</text>

      <!-- 登录失败提示：内联展示，不能用 uni.showToast —— 登录框的 mask z-index 是
           9999（App.vue 强制），toast 会被完全遮住，表现为「日志有错、界面无反应」 -->
      <text v-if="loginError" class="send-error">{{ loginError }}</text>

      <!-- 协议勾选 -->
      <view class="agreement" @click="toggleAgree">
        <view class="checkbox" :class="{ checked: agreed }">
          <text v-if="agreed" class="check-mark">✓</text>
        </view>
        <text class="agree-text">
          我已阅读并同意
          <text class="link" @click.stop="openAgreement('user_agreement')">《用户协议》</text>
          和
          <text class="link" @click.stop="openAgreement('privacy_policy')">《隐私政策》</text>
        </text>
      </view>

      <button
        class="submit-btn"
        :class="{ disabled: !canSubmit }"
        :disabled="!canSubmit"
        @click="onLogin"
      >
        <text class="submit-text">{{ buttonText }}</text>
      </button>

      <!-- Sign in with Apple：仅 iOS 展示。
           不套用 uni 的 Apple 按钮样式（Apple 审核要求使用官方外观），
           这里保留黑色胶囊 + 白字 + Apple 标志的通用样式。 -->
      <view v-if="showAppleLogin" class="apple-divider">
        <view class="divider-line" />
        <text class="divider-text">其他方式</text>
        <view class="divider-line" />
      </view>

      <button
        v-if="showAppleLogin"
        class="apple-btn"
        :class="{ disabled: !canAppleLogin }"
        :disabled="!canAppleLogin"
        @click="onAppleLogin"
      >
        <text class="apple-icon">&#63743;</text>
        <text class="apple-text">{{ appleButtonText }}</text>
      </button>

      <text v-if="dismissible" class="skip" @click="onClose">暂不登录</text>
    </view>
  </uni-popup>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import { authApi } from '@/api/auth'
import { getAgreementVersion } from '@/constants/agreements'
import { isAppleIAPPlatform } from '@/utils/nativePay'

const userStore = useUserStore()
const { showLoginModal, loginModalOptions } = storeToRefs(userStore)

const popupRef = ref<any>(null)

const phone = ref('')
const code = ref('')
const agreed = ref(false)
const submitting = ref(false)
/** Apple 登录进行中（与短信登录共用 submitting 会导致按钮互相禁用，这里独立） */
const appleSubmitting = ref(false)
/** 发送验证码中（按钮 loading 态，防连点） */
const sending = ref(false)
/** 倒计时剩余秒数，0 = 可重发 */
const countdown = ref(0)
/** 频控 / 短信通道失败的提示文案 */
const sendError = ref('')
/** 登录失败提示文案（验证码错误 / 网络失败 / 未勾协议），内联展示在弹窗内 */
const loginError = ref('')
// 补签阶段标记:登录成功但后端要求补签协议时为 true,防止重复点击
const signingAgreements = ref(false)

let timer: ReturnType<typeof setInterval> | null = null

const dismissible = computed(() => !!loginModalOptions.value?.dismissible)
const canSendCode = computed(
  () => !sending.value && countdown.value === 0 && /^1\d{10}$/.test(phone.value),
)
const canSubmit = computed(
  () => agreed.value && !submitting.value && !signingAgreements.value
    && /^1\d{10}$/.test(phone.value) && /^\d{4,6}$/.test(code.value),
)
const sendCodeText = computed(() => {
  if (sending.value) return '发送中...'
  if (countdown.value > 0) return `${countdown.value}s 后重发`
  return '获取验证码'
})
const buttonText = computed(() => {
  if (signingAgreements.value) return '补签协议中...'
  if (submitting.value) return '登录中...'
  return '登录'
})

/** Sign in with Apple 仅在 iOS 端展示（Android 走短信登录即可） */
const showAppleLogin = computed(() => isAppleIAPPlatform())
const canAppleLogin = computed(
  () => agreed.value && !appleSubmitting.value && !submitting.value && !signingAgreements.value,
)
const appleButtonText = computed(() => (appleSubmitting.value ? '登录中...' : '使用 Apple 登录'))

/**
 * 打开 popup 的鲁棒实现:
 * uni-popup 的 ref 不一定在第一次 nextTick 就 ready ——
 * 用最多 5 次 / 每次 50ms 的重试来兜住时序。
 * _opening 做幂等:immediate watch 与 onMounted 兜底可能同时触发 open,只允许一次在途打开。
 */
let _opening = false
function tryOpenPopup(retries = 5) {
  if (popupRef.value?.open) {
    if (_opening) return
    _opening = true
    popupRef.value.open('center')
    setTimeout(() => { _opening = false }, 100)
    return
  }
  if (retries <= 0) {
    console.warn('[LoginModal] popupRef 5 次重试后仍为 null,uni-popup 没注册成功')
    return
  }
  setTimeout(() => tryOpenPopup(retries - 1), 50)
}

function stopCountdown() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  countdown.value = 0
}

function startCountdown(seconds: number) {
  stopCountdown()
  countdown.value = seconds
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) stopCountdown()
  }, 1000)
}

// 同步 store 的 showLoginModal → uni-popup
// immediate: true —— App.vue onLaunch 可能在本组件 mount 之前就已经把 showLoginModal 设成 true
watch(showLoginModal, (show) => {
  if (show) {
    agreed.value = false
    submitting.value = false
    signingAgreements.value = false
    appleSubmitting.value = false
    code.value = ''
    sendError.value = ''
    loginError.value = ''
    // 再次打开时若上一轮倒计时还在，继续接着走（用户中途关闭了弹窗）
    nextTick(() => tryOpenPopup())
  } else {
    popupRef.value?.close?.()
  }
}, { immediate: true })

onMounted(() => {
  if (showLoginModal.value) {
    nextTick(() => tryOpenPopup())
  }
})

onUnmounted(() => stopCountdown())

function onPopupChange(e: { show: boolean }) {
  // 兜底：如果用户通过系统返回/手势关闭，同步 store
  if (!e.show && showLoginModal.value) {
    if (dismissible.value) {
      userStore.closeLoginModal()
    } else {
      // 强制登录：拦截系统返回 / 手势关闭，re-open 弹窗
      setTimeout(() => popupRef.value?.open?.('center'), 0)
    }
  }
}

function onPhoneInput(e: any) {
  // 只取数字，防止输入法带入空格/分隔符
  phone.value = String(e?.detail?.value ?? '').replace(/\D/g, '').slice(0, 11)
  if (!/^1\d{10}$/.test(phone.value)) sendError.value = ''
}

function onCodeInput(e: any) {
  code.value = String(e?.detail?.value ?? '').replace(/\D/g, '').slice(0, 6)
  // 重新输入即视为用户已看到上次的错误提示
  if (loginError.value) loginError.value = ''
}

function toggleAgree() {
  agreed.value = !agreed.value
  if (agreed.value && loginError.value === '请先勾选协议') loginError.value = ''
}

function openAgreement(type: string) {
  uni.navigateTo({ url: `/pages/agreement/detail?type=${type}` })
}

function onClose() {
  if (submitting.value || signingAgreements.value || appleSubmitting.value) return
  userStore.closeLoginModal()
}

/** 发送短信验证码 */
async function onSendCode() {
  if (!canSendCode.value) return
  sending.value = true
  sendError.value = ''
  try {
    const res = await authApi.sendSms(phone.value, 'login')
    startCountdown(res?.retry_after || 60)
  } catch (e: any) {
    const msg = e?.message || '发送失败，请稍后重试'
    // 频控类错误直接转成倒计时，避免用户狂点
    if (/频繁|过快|too many|rate/i.test(msg)) {
      startCountdown(60)
    }
    sendError.value = msg
  } finally {
    sending.value = false
  }
}

async function onLogin() {
  if (!agreed.value) {
    loginError.value = '请先勾选协议'
    return
  }
  if (!canSubmit.value) return
  submitting.value = true
  loginError.value = ''
  try {
    // 1) 主动登录:用户已在弹框内勾选 = 同意《用户协议》和《隐私政策》
    const resp = await userStore.loginWithPhone({
      phone: phone.value,
      code: code.value,
    })

    // 2) 补签协议 + 关弹窗 + 成功提示（与 Apple 登录共用）
    await finishLogin(resp)
  } catch (e: any) {
    // 半登录态(token 已写但协议没签完) → 清掉
    if (userStore.agreementRequired) {
      userStore.clear()
    }
    // 把真实错误透给用户：内联展示，不走 toast（会被弹窗 mask 遮住）
    const msg = e?.message || e?.errMsg || '登录失败,请重试'
    loginError.value = msg
    // 验证码一次性使用，登录失败后必须重新输入
    code.value = ''
    console.error('[LoginModal] loginWithPhone failed', e)
  } finally {
    submitting.value = false
    signingAgreements.value = false
  }
}

/**
 * 登录成功后的收尾：补签协议 → 关弹窗 → 提示。
 * 短信登录与 Apple 登录共用，避免两条链路行为漂移。
 */
async function finishLogin(resp: { agreement_required: boolean; missing_agreements?: string[] }) {
  // 后端要求补签协议(首次进入 / 协议升级 / 上次进来没签完)
  // 在 LoginModal 内同步补签，不 navigateTo 跳详情页
  if (resp.agreement_required && resp.missing_agreements?.length) {
    signingAgreements.value = true
    for (const t of resp.missing_agreements) {
      // 单条失败不阻断 —— 后端可能已记录过(协议升级时已自动 sign 过的)；继续走下一条
      try {
        await authApi.acceptAgreement(t, getAgreementVersion(t))
      } catch (e) {
        console.warn('[LoginModal] acceptAgreement failed', t, e)
      }
    }
    signingAgreements.value = false
    userStore.setAgreementOK()
  }

  // 先关弹窗、再弹成功 toast —— 弹窗 mask 的 z-index 是 9999，
  // 弹窗还开着时 toast 会被完全遮住
  userStore.notifyLoginSuccess().catch(() => {})
  setTimeout(() => {
    uni.showToast({ title: '登录成功', icon: 'success' })
  }, 350)
}

/**
 * Sign in with Apple 登录。
 *
 * uni.login({provider:'apple'}) 拉起系统 Apple 授权面板，
 * 成功后返回一次性 authorization code，直接交给服务端换 token。
 * 前端不做任何身份判定，也不缓存 code。
 *
 * 关于 nonce：**当前不要上传 nonce**。
 * nonce 必须随 Apple 授权请求一起下发并由 Apple 签入 id_token，
 * 而 uni.login 不暴露该参数（拿到 code 后再生成已无意义），
 * 上传随机值会被服务端判为重放攻击导致登录必然失败。
 * 服务端对空 nonce 会跳过比对；重放防护由「authorization code 一次性 +
 * 服务端即时换 token 验签」承担。
 * 若后续要启用 nonce，需自写 UTS 插件走 ASAuthorizationAppleIDRequest.nonce。
 */
async function onAppleLogin() {
  if (!agreed.value) {
    loginError.value = '请先勾选协议'
    return
  }
  if (!canAppleLogin.value) return

  appleSubmitting.value = true
  loginError.value = ''

  let authCode = ''
  try {
    const loginRes = (await uni.login({ provider: 'apple' })) as any
    authCode = loginRes?.authResult?.code || loginRes?.code || ''
    if (!authCode) {
      throw new Error('未获取到 Apple 授权凭证，请重试')
    }
  } catch (e: any) {
    const msg = String(e?.errMsg || e?.message || '')
    // 用户取消授权不算错误，静默保持弹窗原状
    if (msg.toLowerCase().indexOf('cancel') < 0) {
      loginError.value = msg || 'Apple 授权失败，请重试'
    }
    appleSubmitting.value = false
    return
  }

  try {
    const resp = await userStore.loginWithApple({ code: authCode })
    await finishLogin(resp)
  } catch (e: any) {
    if (userStore.agreementRequired) {
      userStore.clear()
    }
    loginError.value = e?.message || e?.errMsg || 'Apple 登录失败，请重试'
    console.error('[LoginModal] loginWithApple failed', e)
  } finally {
    appleSubmitting.value = false
    signingAgreements.value = false
  }
}
</script>

<style scoped>
.login-modal {
  position: relative;
  background: #fff;
  border-radius: 30rpx;
  width: 620rpx;
  padding: 70rpx 50rpx 50rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.15);
}

.close-btn {
  position: absolute;
  top: 20rpx;
  right: 24rpx;
  width: 50rpx;
  height: 50rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  color: #999;
  line-height: 1;
}

.logo {
  width: 140rpx;
  height: 140rpx;
  border-radius: 30rpx;
  margin-bottom: 20rpx;
}

.title {
  font-size: 36rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 12rpx;
}

.subtitle {
  font-size: 24rpx;
  color: #999;
  text-align: center;
  line-height: 1.5;
  margin-bottom: 20rpx;
}

.field {
  width: 100%;
  margin-top: 24rpx;
  height: 88rpx;
  border-bottom: 1rpx solid rgba(236, 236, 236, 1);
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.field-prefix {
  font-size: 28rpx;
  color: #333;
  font-weight: 600;
  flex-shrink: 0;
}

.field-input {
  flex: 1;
  min-width: 0;
  font-size: 30rpx;
  color: #333;
  height: 88rpx;
}

.field-ph {
  color: #bbb;
  font-size: 28rpx;
}

.field-action {
  font-size: 26rpx;
  color: #fea500;
  flex-shrink: 0;
  padding: 10rpx 0 10rpx 20rpx;
}

.field-action--disabled {
  color: #ccc;
}

.send-error {
  width: 100%;
  margin-top: 14rpx;
  font-size: 22rpx;
  color: rgba(243, 108, 108, 1);
  text-align: left;
}

.agreement {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  margin-top: 30rpx;
  padding: 0 20rpx;
  width: 100%;
}

.checkbox {
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  border: 2rpx solid #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 4rpx;
  background: #fff;
}

.checkbox.checked {
  background: linear-gradient(135deg, #fea500 0%, #ffd200 100%);
  border-color: transparent;
}

.check-mark {
  color: #fff;
  font-size: 22rpx;
  line-height: 1;
}

.agree-text {
  font-size: 24rpx;
  color: #666;
  line-height: 1.6;
  flex: 1;
}

.link {
  color: #fea500;
}

.submit-btn {
  margin-top: 40rpx;
  background: linear-gradient(135deg, rgba(254, 165, 0, 1) 0%, rgba(255, 210, 0, 1) 100%);
  border-radius: 50rpx;
  padding: 24rpx 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  width: 90%;
}

.submit-btn::after {
  border: none;
}

.submit-btn.disabled {
  opacity: 0.4;
}

.submit-text {
  font-size: 30rpx;
  font-weight: 600;
  color: #fff;
}

.skip {
  margin-top: 24rpx;
  font-size: 24rpx;
  color: #999;
  padding: 10rpx 20rpx;
}

.apple-divider {
  display: flex;
  align-items: center;
  gap: 16rpx;
  width: 90%;
  margin-top: 32rpx;
}

.divider-line {
  flex: 1;
  height: 1rpx;
  background: #eee;
}

.divider-text {
  font-size: 22rpx;
  color: #bbb;
}

.apple-btn {
  margin-top: 24rpx;
  width: 90%;
  background: #000;
  border-radius: 50rpx;
  padding: 22rpx 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
}

.apple-btn::after {
  border: none;
}

.apple-btn.disabled {
  opacity: 0.4;
}

.apple-icon {
  font-size: 34rpx;
  color: #fff;
  line-height: 1;
  margin-right: 12rpx;
}

.apple-text {
  font-size: 30rpx;
  font-weight: 600;
  color: #fff;
}
</style>
