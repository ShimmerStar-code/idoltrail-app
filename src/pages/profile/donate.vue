<template>
  <PageLayout>
    <view class="page">
      <!-- 顶部沉浸式 -->
      <view class="nav" :style="{ paddingTop: statusBarHeight + 10 + 'px' }">
        <view class="nav-back" @click="onBack">
          <uni-icons type="left" size="large" color="#000" />
        </view>
        <text class="nav-title">赞助 idoltrail</text>
        <view class="nav-back" style="visibility: hidden" />
      </view>

    <scroll-view scroll-y class="scroll-body">
      <!-- 顶部 hero 区 -->
      <view class="hero">
        <view class="hero-badge">❤️ 每一份支持都被认真对待</view>
        <view class="hero-title">感谢您的支持！</view>
        <view class="hero-sub">
          idoltrail
          是一个免费的演唱会信息聚合应用，您的赞助将用于服务器、版权数据采购、内容运营等开支。
        </view>
        <view class="hero-stats">
          <view class="stat-item">
            <text class="stat-num">免费</text>
            <text class="stat-label">永久无广告</text>
          </view>
          <view class="stat-divider" />
          <view class="stat-item">
            <text class="stat-num">公开</text>
            <text class="stat-label">资金去向透明</text>
          </view>
          <view class="stat-divider" />
          <view class="stat-item">
            <text class="stat-num">感恩</text>
            <text class="stat-label">每笔都铭记</text>
          </view>
        </view>
      </view>

      <!-- ── 当前平台不可用时的说明（iOS / 功能未开放） ── -->
      <view v-if="!donateAvailable" class="card">
        <view class="card-header">
          <text class="card-title">{{ unavailableTitle }}</text>
        </view>
        <text class="unavailable-text">{{ unavailableReason }}</text>
      </view>

      <template v-else>
        <!-- 金额选择（档位来自服务端 /donation-products） -->
        <view class="card">
          <view class="card-header">
            <text class="card-title">选择赞助金额</text>
            <text class="card-tip">单位：元</text>
          </view>

          <view class="amount-grid">
            <view
              v-for="t in iapTiers"
              :key="t.productId"
              class="amount-btn"
              :class="{ 'amount-btn--active': selectedProductId === t.productId }"
              @click="selectTier(t.productId)"
            >
              <text class="amount-symbol">¥</text>
              <text class="amount-num">{{ t.amountYuan }}</text>
            </view>
          </view>

          <view class="amount-validate">
            <text v-if="validateMsg" class="amount-validate__msg">{{ validateMsg }}</text>
          </view>

          <!-- iOS 必须说明走的是应用内购买，避免用户预期与实际不符 -->
          <view v-if="isIOS" class="iap-note">
            <text class="iap-note__text">
              iOS 版通过 Apple 应用内购买完成，将向 Apple 支付并由其收取 15%–30% 手续费，
              剩余部分作为赞助款到账。
            </text>
          </view>
        </view>
      </template>

      <!-- 捐赠承诺 -->
      <view class="promise">
        <view class="promise-item">
          <view class="promise-dot" />
          <text class="promise-text">所有款项仅用于 idoltrail 运营，不做他用</text>
        </view>
      </view>

      <!-- 底部留白避免被悬浮按钮遮住 -->
      <view class="bottom-spacer" />
    </scroll-view>

    <!-- 底部支付栏（仅在通道可用时展示） -->
    <view v-if="donateAvailable" class="pay-bar">
      <view class="pay-info">
        <text class="pay-info__label">支付金额</text>
        <view class="pay-info__amount">
          <text class="pay-info__symbol">¥</text>
          <text class="pay-info__num">{{ currentAmountText }}</text>
        </view>
      </view>
      <button
        class="pay-btn"
        :class="{ 'pay-btn--disabled': !canPay || paying }"
        :disabled="!canPay || paying"
        @click="onDonate"
      >
        <text v-if="paying" class="pay-btn__loading">
          <text class="pay-btn__spinner" />
          支付中...
        </text>
        <text v-else>立即赞助</text>
      </button>
    </view>

    <!-- 全屏支付遮罩 -->
    <view v-if="paying" class="mask">
      <view class="mask-box">
        <view class="mask-spinner" />
        <text class="mask-text">{{ maskText }}</text>
      </view>
    </view>

    <!-- 成功反馈 modal -->
    <view v-if="successVisible" class="success-modal" @click.self="onSuccessClose">
      <view class="success-card">
        <view class="success-circle">
          <text class="success-tick">✓</text>
        </view>
        <text class="success-title">感谢您的支持 💛</text>
        <text class="success-amount">已成功赞助 ¥{{ successAmount }}</text>
        <text class="success-tip">您的支持是我们继续前行的动力</text>
        <button class="success-btn" @click="onSuccessClose">完成</button>
      </view>
    </view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { donateApi } from "@/api/donate";
import { withLogin } from "@/utils/auth-guard";
import { getStatusBarHeight } from "@/utils/system";
import { onUnload } from "@dcloudio/uni-app";
import { computed, onMounted, ref } from "vue";
import PageLayout from "@/components/PageLayout/index.vue";
import {
  getNativePlatform,
  isAppleIAPPlatform,
  requestAppleIAP,
  NativePayErrorCode,
} from "@/utils/nativePay";

// 支付遮罩的存活标记：页面卸载后置 false，避免退到后台仍尝试关弹层
onUnload(() => {
  _alive = false;
});

// ─── 业务常量 ───
const MIN_AMOUNT = 0.01; // 元
const MAX_AMOUNT = 10000; // 元

/**
 * ── 支付通道可用性（APP-09）──
 *   1. VITE_DONATE_ENABLED=false      → 全局关闭
 *   2. iOS 走 StoreKit IAP，开关 VITE_DONATE_IOS_ENABLED
 *      （iOS 数字内容不允许走微信/支付宝，这是 App Store 审核硬性要求）
 *   3. Android 走微信/支付宝 App 支付，但后端对账接口尚未落地，
 *      开关 VITE_DONATE_NATIVE_READY 必须保持 false，否则点「捐赠」必然失败
 *
 * iOS 档位（product_id → 金额）以服务端 /donation-products 为准，
 * 前端不硬编码金额，只把服务端下发的 product_id 交给 StoreKit。
 */
const DONATE_ENABLED = import.meta.env.VITE_DONATE_ENABLED === "true";
const NATIVE_PAY_READY = import.meta.env.VITE_DONATE_NATIVE_READY === "true";
const DONATE_IOS_ENABLED = import.meta.env.VITE_DONATE_IOS_ENABLED === "true";

const isIOS = computed(() => isAppleIAPPlatform());
const isAndroid = computed(() => getNativePlatform() === "android");

const donateAvailable = computed(() => {
  if (!DONATE_ENABLED) return false;
  // iOS：StoreKit IAP
  if (isIOS.value) return DONATE_IOS_ENABLED && iapTiers.value.length > 0;
  // Android：原生支付通道未接通前不开放
  return NATIVE_PAY_READY && isAndroid.value;
});

const unavailableTitle = computed(() =>
  !DONATE_ENABLED
    ? "赞助通道暂未开放"
    : isIOS.value
      ? "iOS 赞助通道暂未开放"
      : "赞助通道接入中",
);

const unavailableReason = computed(() => {
  if (!DONATE_ENABLED) {
    return "赞助通道正在准备中，开放后本页面即可使用。";
  }
  if (isIOS.value) {
    return "iOS 版赞赏需通过应用内购买完成，商品尚未上架，请稍后再试。";
  }
  return "Android 版赞助通道正在接入中，开放后本页面即可使用。期间可先关注公众号获取进展。";
});

// ─── UI state ───
const statusBarHeight = ref(20);
const paying = ref(false);
const maskText = ref("拉起支付...");
const successVisible = ref(false);
const successAmount = ref(0);
const validateMsg = ref("");

/**
 * iOS 内购档位。来源为服务端，客户端不自行决定金额。
 * 结构：{ productId, amountCents, amountYuan }
 */
interface IAPTier {
  productId: string;
  amountCents: number;
  amountYuan: number;
}
const iapTiers = ref<IAPTier[]>([]);
/** 当前选中的 product_id（iOS） */
const selectedProductId = ref("");

onMounted(async () => {
  statusBarHeight.value = getStatusBarHeight();
  if (isIOS.value && DONATE_IOS_ENABLED) {
    await loadIAPTiers();
  }
});

/**
 * 拉取服务端下发的内购档位。
 *
 * 失败时保持空数组 —— donateAvailable 会随之变 false，
 * 页面退化为「暂未开放」说明，不会出现能点但必失败的按钮。
 */
async function loadIAPTiers() {
  try {
    const map = await donateApi.getAppleIAPProducts();
    const list: IAPTier[] = Object.keys(map || {})
      .map((productId) => {
        const amountCents = Number(map[productId]) || 0;
        return {
          productId,
          amountCents,
          amountYuan: amountCents / 100,
        };
      })
      // 过滤非法档位并按金额升序，避免后端配置错乱导致 UI 出现 0 元档
      .filter((t) => t.amountCents >= MIN_AMOUNT * 100 && t.amountCents <= MAX_AMOUNT * 100)
      .sort((a, b) => a.amountCents - b.amountCents);
    iapTiers.value = list;
    selectedProductId.value = list[0]?.productId || "";
  } catch (e) {
    console.warn("[donate] load apple iap products failed", e);
    iapTiers.value = [];
    selectedProductId.value = "";
  }
}

// ─── 派生数据 ───

/** 当前选中的档位（iOS） */
const selectedTier = computed(
  () => iapTiers.value.find((t) => t.productId === selectedProductId.value) || null,
);

/** 当前金额（用于显示，单位：元） */
const currentAmountText = computed(() => {
  const t = selectedTier.value;
  if (!t) return "0";
  return Number.isInteger(t.amountYuan) ? String(t.amountYuan) : t.amountYuan.toFixed(2);
});

const canPay = computed(() => !!selectedTier.value && !paying.value);

// ─── 交互 ───

function selectTier(productId: string) {
  selectedProductId.value = productId;
  validateMsg.value = "";
}

function onBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: "/pages/profile/index" });
}

// ─── 支付流程 ───

async function onDonate() {
  if (!donateAvailable.value) return;
  if (!canPay.value) return;

  // 强制登录（dismissible: false —— 捐钱必须登录）
  await withLogin(() => realDonate(), { dismissible: false, reason: "donate" });
}

/**
 * iOS 捐赠：StoreKit 内购 + 服务端验签入账。
 *
 * 时序与微信完全不同：钱先进 Apple，本项目拿不到商户单号，
 * 因此是「客户端先付、后端按 transactionId 查证并补建订单」。
 * 前端的 success 只代表用户完成了购买动作，绝不能当已支付。
 */
async function realDonate() {
  const tier = selectedTier.value;
  if (!tier) return;

  paying.value = true;
  _alive = true;
  validateMsg.value = "";

  try {
    // 1. 调起 StoreKit
    maskText.value = "拉起支付...";
    const result = await requestAppleIAP({
      productId: tier.productId,
      productDescription: `赞助 idoltrail ¥${currentAmountText.value}`,
    });

    if (!_alive) return;

    if (!result.transactionId) {
      // 拿不到交易号就无法让服务端验签，只能提示稍后重试
      validateMsg.value = "未获取到交易凭证，请稍后在「我的订单」中查看";
      return;
    }

    // 2. 服务端验签入账（幂等，可安全重试）
    maskText.value = "确认支付结果...";
    const verified = await donateApi.verifyAppleIAP({
      transaction_id: result.transactionId,
      product_id: tier.productId,
    });

    // 3. 以服务端返回的金额为准展示
    showSuccess(verified.amount);
  } catch (e: any) {
    // 用户取消不是错误，保持页面原状不打扰
    if (e?.code === NativePayErrorCode.CANCELLED) return;
    console.error("[donate] apple iap error:", e);
    validateMsg.value = e?.message || "支付失败，请稍后重试";
    uni.showToast({ title: "支付失败，请稍后重试", icon: "none" });
  } finally {
    paying.value = false;
  }
}

let _alive = true;

/** 显示成功反馈 */
function showSuccess(amountCents: number) {
  successAmount.value = amountCents / 100;
  successVisible.value = true;
}

function onSuccessClose() {
  successVisible.value = false;
  // 刷新个人中心 contribution（popTo 返回时自动 onShow）
  uni.navigateBack();
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  /* background: linear-gradient(180deg, #fef6e0 0%, #fef0d0 18%, #f5f5f5 60%); */
  display: flex;
  flex-direction: column;
}

/* ─── 顶部 ─── */
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 24rpx 22rpx;
}
.nav-back {
  width: 60rpx;
  height: 60rpx;
  border-radius: 30rpx;
  background: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}
.nav-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #5a3216;
  letter-spacing: 2rpx;
}

/* ─── Hero ─── */
.hero {
  margin: 8rpx 24rpx 30rpx;
  padding: 36rpx 32rpx 30rpx;
  border-radius: 32rpx;
  background: linear-gradient(135deg, #fea500 0%, #ffd200 100%);
  box-shadow: 0 16rpx 40rpx rgba(254, 165, 0, 0.25);
  position: relative;
  overflow: hidden;
}
.hero::before {
  content: "";
  position: absolute;
  top: -120rpx;
  right: -120rpx;
  width: 280rpx;
  height: 280rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
}
.hero::after {
  content: "";
  position: absolute;
  bottom: -80rpx;
  left: -80rpx;
  width: 200rpx;
  height: 200rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
}
.hero-badge {
  display: inline-block;
  padding: 8rpx 18rpx;
  border-radius: 30rpx;
  background: rgba(255, 255, 255, 0.3);
  font-size: 22rpx;
  color: #fff;
  margin-bottom: 18rpx;
  position: relative;
  z-index: 1;
}
.hero-title {
  font-size: 40rpx;
  font-weight: 800;
  color: #fff;
  margin-bottom: 14rpx;
  position: relative;
  z-index: 1;
}
.hero-sub {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.92);
  line-height: 1.7;
  margin-bottom: 28rpx;
  position: relative;
  z-index: 1;
}
.hero-stats {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 20rpx;
  padding: 18rpx 10rpx;
  position: relative;
  z-index: 1;
}
.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}
.stat-num {
  font-size: 28rpx;
  font-weight: 700;
  color: #fff;
}
.stat-label {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.85);
}
.stat-divider {
  width: 1rpx;
  height: 36rpx;
  background: rgba(255, 255, 255, 0.35);
}

/* ─── 金额卡片 ─── */
.card {
  margin: 0 24rpx;
  background: #fff;
  border-radius: 28rpx;
  padding: 32rpx 28rpx;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.04);
}
.card-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 24rpx;
}
.card-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #222;
}
.card-tip {
  font-size: 22rpx;
  color: #999;
}

/* 渠道不可用时的说明块 */
.unavailable-text {
  display: block;
  font-size: 26rpx;
  line-height: 1.7;
  color: #666;
}

.amount-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 18rpx;
}
.amount-btn {
  flex: 1 1 calc(33.33% - 12rpx);
  min-width: calc(33.33% - 12rpx);
  box-sizing: border-box;
  height: 130rpx;
  border-radius: 24rpx;
  background: #fafafa;
  border: 2rpx solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  transition: all 0.2s ease;
}
.amount-btn--active {
  background: linear-gradient(135deg, #fea500 0%, #ffd200 100%);
  border-color: #fea500;
  transform: scale(1.03);
  box-shadow: 0 8rpx 20rpx rgba(254, 165, 0, 0.3);
}
.amount-symbol {
  font-size: 24rpx;
  color: #999;
}
.amount-num {
  font-size: 40rpx;
  font-weight: 700;
  color: #333;
}
.amount-btn--active .amount-symbol,
.amount-btn--active .amount-num {
  color: #fff;
}

.amount-validate {
  margin-top: 16rpx;
  min-height: 32rpx;
}
.amount-validate__msg {
  font-size: 22rpx;
  color: #ff4d4f;
}
.amount-validate__hint {
  font-size: 22rpx;
  color: #aaa;
}

/* iOS 应用内购买提示 */
.iap-note {
  margin-top: 20rpx;
  padding: 18rpx 20rpx;
  border-radius: 16rpx;
  background: rgba(254, 165, 0, 0.08);
}
.iap-note__text {
  font-size: 21rpx;
  line-height: 1.65;
  color: #a5711a;
}

/* ─── 捐赠承诺 ─── */
.promise {
  margin: 30rpx 24rpx 0;
  padding: 28rpx 28rpx;
  background: #fff;
  border-radius: 24rpx;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.04);
}
.promise-item {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  padding: 10rpx 0;
}
.promise-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: #fea500;
  margin-top: 12rpx;
  flex-shrink: 0;
}
.promise-text {
  font-size: 26rpx;
  color: #555;
  line-height: 1.6;
  flex: 1;
}

.bottom-spacer {
  height: 200rpx;
}

/* ─── 底部支付栏 ─── */
.pay-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  box-shadow: 0 -8rpx 24rpx rgba(0, 0, 0, 0.06);
  padding: 30rpx 24rpx;
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.pay-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}
.pay-info__label {
  font-size: 22rpx;
  color: #999;
}
.pay-info__amount {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
}
.pay-info__symbol {
  font-size: 26rpx;
  color: #ff4d4f;
  font-weight: 600;
}
.pay-info__num {
  font-size: 38rpx;
  font-weight: 800;
  color: #ff4d4f;
}
.pay-btn {
  flex: 1;
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 48rpx;
  background: linear-gradient(135deg, #fea500 0%, #ffd200 100%);
  color: #fff;
  font-size: 32rpx;
  font-weight: 700;
  text-align: center;
  border: none;
  box-shadow: 0 8rpx 20rpx rgba(254, 165, 0, 0.3);
  transition: all 0.2s ease;
}
.pay-btn::after {
  border: none;
}
.pay-btn--disabled {
  background: #ddd;
  color: #fff;
  box-shadow: none;
}
.pay-btn__loading {
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
}
.pay-btn__spinner {
  width: 28rpx;
  height: 28rpx;
  border: 4rpx solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ─── 全屏支付遮罩 ─── */
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99;
}
.mask-box {
  background: #fff;
  border-radius: 24rpx;
  padding: 60rpx 80rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
}
.mask-spinner {
  width: 56rpx;
  height: 56rpx;
  border: 6rpx solid #f0f0f0;
  border-top-color: #fea500;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.mask-text {
  font-size: 28rpx;
  color: #333;
}

/* ─── 成功 modal ─── */
.success-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.3s ease;
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.success-card {
  width: 560rpx;
  background: #fff;
  border-radius: 32rpx;
  padding: 60rpx 40rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes popIn {
  from {
    transform: scale(0.7);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
.success-circle {
  width: 140rpx;
  height: 140rpx;
  border-radius: 70rpx;
  background: linear-gradient(135deg, #fea500 0%, #ffd200 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 30rpx;
  box-shadow: 0 12rpx 32rpx rgba(254, 165, 0, 0.35);
}
.success-tick {
  font-size: 80rpx;
  color: #fff;
  font-weight: 700;
  line-height: 1;
}
.success-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #222;
  margin-bottom: 16rpx;
}
.success-amount {
  font-size: 30rpx;
  color: #ff4d4f;
  font-weight: 700;
  margin-bottom: 10rpx;
}
.success-tip {
  font-size: 24rpx;
  color: #999;
  margin-bottom: 40rpx;
  text-align: center;
}
.success-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  background: linear-gradient(135deg, #fea500 0%, #ffd200 100%);
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
  border: none;
}
.success-btn::after {
  border: none;
}
</style>
