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
        <!-- ⚠️ 临时预览标记：与脚本里的 PREVIEW 常量一起删除 ⚠️ -->
        <text v-if="PREVIEW" class="preview-tip"
          >预览模式 · 支付未接通，看完请把 donate.vue 的 PREVIEW 改回 false</text
        >

        <!-- Hero：把主语交还粉丝 —— App 是目送的人，不是要账的人 -->
        <view class="hero">
          <text class="hero-title">请你尽管全量奔赴向热爱</text>
          <text class="hero-sub">
            上线、改期、开票，我们替你盯着——不让你错过 TA 的每一场。
          </text>
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
              <text class="card-title">支持金额</text>
              <text class="card-tip">单位：元</text>
            </view>

            <view class="amount-grid">
              <view
                v-for="t in tiers"
                :key="t.key"
                class="amount-btn"
                :class="{ 'amount-btn--active': selectedTierKey === t.key }"
                @click="selectTier(t.key)"
              >
                <text class="amount-symbol">¥</text>
                <text class="amount-num">{{ t.amountYuan }}</text>
              </view>
            </view>

            <view class="amount-validate">
              <text v-if="validateMsg" class="amount-validate__msg">{{ validateMsg }}</text>
            </view>

            <!-- 必须说明实际走哪条通道，避免用户预期与实际不符 -->
            <text v-if="isIOS" class="iap-note"
              >iOS 版通过 Apple 应用内购买支付，Apple 收取 15%–30% 手续费。</text
            >
            <text v-else-if="isAndroid" class="iap-note"
              >Android 版通过微信支付完成，支付结果以到账记录为准。</text
            >
          </view>

          <!-- 资金去向：把「资金去向透明」的口号换成可核对的占比条 -->
          <view class="usage">
            <text class="usage-title">你的赞助用在哪</text>
            <view class="usage-bar">
              <view
                v-for="u in FUND_USAGE"
                :key="u.label"
                class="usage-bar__seg"
                :style="{ width: u.percent + '%', background: u.color }"
              />
            </view>
            <view class="usage-legend">
              <view v-for="u in FUND_USAGE" :key="u.label" class="usage-legend__row">
                <view class="usage-dot" :style="{ background: u.color }" />
                <text class="usage-label">{{ u.label }}</text>
                <text class="usage-pct">{{ u.percent }}%</text>
              </view>
            </view>
          </view>
        </template>

        <!-- 一行承诺：承接「奔赴」，把「付钱」换成「不漏的消息」 -->
        <text class="fineprint">你付的每一分，都会变成下一条不漏的消息。</text>

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
          <text v-else>{{ payBtnText }}</text>
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
import { useUserStore } from "@/stores/user";
import {
  getNativePlatform,
  isAppleIAPPlatform,
  requestAppleIAP,
  requestWxAppPay,
  NativePayErrorCode,
} from "@/utils/nativePay";
import { DONATE_ENABLED, DONATE_IOS_ENABLED, DONATE_NATIVE_READY } from "@/utils/env";

// ============================================================================
// 预览开关：临时用来绕过 DONATE_ENABLED / 平台判定 / 档位来源三道门禁，
// 只为在真机上看到页面效果。目前为 false，即走正常门禁逻辑。
// 页面里所有 if (PREVIEW) 分支都是恒假的死代码，后续可直接删除。
// ============================================================================
const PREVIEW = false;

/**
 * ── 资金去向（静态文案 + 占比条）──
 * 不做「已有多少人赞助 / 共收到多少」这类需要后端统计的数字（后端无公开统计接口），
 * 改为给出可核对的固定去向，把「资金去向透明」从口号落成证据。
 * 百分比需与真实成本结构核对后再定稿，不要虚报。
 */
const FUND_USAGE = [
  { label: "数据采集与整理", percent: 60, color: "#0d9488" },
  { label: "服务器与带宽", percent: 25, color: "#5eead4" },
  { label: "短信验证码", percent: 15, color: "#99f6e4" },
] as const;

// 支付遮罩的存活标记：页面卸载后置 false，避免退到后台仍尝试关弹层
let _alive = true;
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
 *   3. Android 走微信 App 支付（channel=wx_app），开关 VITE_DONATE_NATIVE_READY
 *
 * 三个开关统一从 utils/env 读取，不在页面里裸写 import.meta.env。
 *
 * 档位（product_id → 金额）以服务端 /donation-products 为准，
 * 前端不硬编码金额，只把服务端下发的 product_id 交给 StoreKit。
 */
const userStore = useUserStore();

const isIOS = computed(() => isAppleIAPPlatform());
const isAndroid = computed(() => getNativePlatform() === "android");

const donateAvailable = computed(() => {
  // 预览模式：直接放行，仅用于看 UI
  if (PREVIEW) return true;
  if (!DONATE_ENABLED) return false;
  // iOS：StoreKit IAP
  if (isIOS.value) return DONATE_IOS_ENABLED && tiers.value.length > 0;
  // Android：微信 App 支付
  return DONATE_NATIVE_READY && isAndroid.value && tiers.value.length > 0;
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
    return "iOS 版赞助需通过应用内购买完成，商品尚未上架，请稍后再试。";
  }
  return "Android 版赞助通道正在接入中，开放后即可使用。";
});

// ─── UI state ───
const statusBarHeight = ref(20);
const paying = ref(false);
const maskText = ref("拉起支付...");
const successVisible = ref(false);
const successAmount = ref("");
const validateMsg = ref("");

/** 分 → 元：整数不带小数，否则保留两位。档位选择与成功回执共用，保证两处口径一致。 */
function formatYuan(cents: number): string {
  const yuan = cents / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

/**
 * 捐赠档位。iOS 与 Android 共用同一套金额（均以服务端 /donation-products 为准），
 * 区别只在支付时如何消费这个档位：
 *   - iOS：把 product_id 交给 StoreKit，由 Apple 侧校验商品
 *   - Android：只用 amountCents 下单，App 支付没有商品概念
 */
interface DonationTier {
  /** 列表渲染与选中态的唯一标识 */
  key: string;
  /** iOS 专用：服务端下发的商品 ID；Android 为 undefined */
  productId?: string;
  amountCents: number;
  amountYuan: number;
}

const tiers = ref<DonationTier[]>([]);
/** 当前选中的档位 key */
const selectedTierKey = ref("");

/**
 * ⚠️ 临时预览兜底档位 —— 与 PREVIEW 一起删除。
 * 预览时后端 /donation-products 拉不到（如后端未启动）也能看到完整金额网格。
 * 档位值对齐后端白名单 donation.tip.1/5/10/20/50/100。
 */
const PREVIEW_FALLBACK_TIERS: DonationTier[] = [1, 5, 10, 20, 50, 100].map((yuan) => ({
  key: `preview.tip.${yuan}`,
  productId: `preview.tip.${yuan}`,
  amountCents: yuan * 100,
  amountYuan: yuan,
}));

onMounted(async () => {
  statusBarHeight.value = getStatusBarHeight();
  // 预览模式下不限平台：Android/H5 也拉档位，否则金额网格会是空的
  const channelOpen = PREVIEW || (isIOS.value ? DONATE_IOS_ENABLED : DONATE_NATIVE_READY);
  if (channelOpen) {
    await loadTiers();
  }
});

/**
 * 拉取服务端下发的档位。
 *
 * 两端都读同一个 /donation-products 接口：iOS 用它的 product_id，
 * Android 只取金额（App 支付没有商品概念）。共用一份来源可以保证
 * iOS 与 Android 展示的档位金额永远一致，不会出现「同一档位两端不同价」。
 *
 * 失败时保持空数组 —— donateAvailable 会随之变 false，
 * 页面退化为「暂未开放」说明，不会出现能点但必失败的按钮。
 */
async function loadTiers() {
  try {
    const map = await donateApi.getAppleIAPProducts();
    const useProductId = isIOS.value;
    const list: DonationTier[] = Object.keys(map || {})
      .map((productId) => {
        const amountCents = Number(map[productId]) || 0;
        return {
          // Android 的 key 不带 product_id：同一金额必须唯一，避免出现两个选中态
          key: useProductId ? productId : `native:${amountCents}`,
          productId: useProductId ? productId : undefined,
          amountCents,
          amountYuan: amountCents / 100,
        };
      })
      // 过滤非法档位并按金额升序，避免后端配置错乱导致 UI 出现 0 元档
      .filter((t) => t.amountCents >= MIN_AMOUNT * 100 && t.amountCents <= MAX_AMOUNT * 100)
      .sort((a, b) => a.amountCents - b.amountCents);

    // 预览模式：后端没给档位时用本地兜底，保证 UI 能完整展示
    const finalList = list.length ? list : PREVIEW ? PREVIEW_FALLBACK_TIERS : [];
    tiers.value = finalList;
    // 默认选中中间档而非最便宜的：默认选中价是强锚点，钉在 ¥1 会让用户把 ¥20 当成「加价」，
    // 反过来从 ¥20 往下调是「减价」，阻力小得多。这只是前端默认选中，
    // 实际支付金额始终以服务端下发的档位为准。
    selectedTierKey.value = finalList[Math.floor(finalList.length / 2)]?.key || "";
  } catch (e) {
    console.warn("[donate] load tiers failed", e);
    // 预览模式：请求失败也用兜底档位
    tiers.value = PREVIEW ? PREVIEW_FALLBACK_TIERS : [];
    selectedTierKey.value = PREVIEW ? PREVIEW_FALLBACK_TIERS[3]?.key || "" : "";
  }
}

// ─── 派生数据 ───

/** 当前选中的档位 */
const selectedTier = computed(
  () => tiers.value.find((t) => t.key === selectedTierKey.value) || null,
);

/** 当前金额（用于显示，单位：元） */
const currentAmountText = computed(() => {
  const t = selectedTier.value;
  return t ? formatYuan(t.amountCents) : "0";
});

/**
 * 支付按钮文案。
 *
 * 赞助必须登录（dismissible: false），而登录框是在用户点击的瞬间才弹出来的，
 * 是这条转化路径上唯一的「意外」。未登录时用「登录并赞助」提前告知，
 * 减少被弹窗惊吓而放弃的流失。
 */
const payBtnText = computed(() => {
  const amount = currentAmountText.value;
  return userStore.isLoggedIn ? `赞助 ¥${amount}` : `登录并赞助 ¥${amount}`;
});

const canPay = computed(() => !!selectedTier.value && !paying.value);

// ─── 交互 ───

function selectTier(key: string) {
  selectedTierKey.value = key;
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
 * 按平台分派到各自的支付链路。
 *
 * 两条链路时序完全不同，不能合并：
 *   - iOS：钱先进 Apple，本项目拿不到商户单号 → 客户端先付、后端按 transactionId 查证补单
 *   - Android：先在服务端下单拿到 order_info → 客户端调起微信 → 后端靠回调入账
 */
async function realDonate() {
  if (isIOS.value) {
    await donateViaAppleIAP();
    return;
  }
  await donateViaWxApp();
}

/**
 * iOS 捐赠：StoreKit 内购 + 服务端验签入账。
 *
 * 时序与微信完全不同：钱先进 Apple，本项目拿不到商户单号，
 * 因此是「客户端先付、后端按 transactionId 查证并补建订单」。
 * 前端的 success 只代表用户完成了购买动作，绝不能当已支付。
 */
async function donateViaAppleIAP() {
  const tier = selectedTier.value;
  if (!tier?.productId) return;

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
      // 拿不到交易号就无法让服务端验签，只能让用户稍后重试
      validateMsg.value = "未获取到交易凭证，请稍后重试";
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
    // 支付全程有全屏 mask 遮着，uni.showToast 会被盖住（且可能被 popup mask 遮挡），
    // 所以只内联提示，不要双写
    validateMsg.value = e?.message || "支付失败，请稍后重试";
  } finally {
    paying.value = false;
  }
}

/** 轮询确认订单的等待上限。
 *
 * 微信回调是异步的，正常秒级到达；给 20s 足够覆盖弱网。
 * 超时不等于支付失败（钱可能已经扣了），所以文案必须引导用户「稍后查看」而不是「重新支付」。
 */
const ORDER_CONFIRM_TIMEOUT = 20_000;

/** 轮询确认的间隔序列：起步快（多数回调很快），后段放缓避免打爆后端 */
const POLL_DELAYS = [800, 1200, 1800, 2600, 3500];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Android 捐赠：微信 App 支付（channel=wx_app）。
 *
 * 时序：服务端下单 → 客户端用 orderInfo 调起微信 → 轮询订单直到回调入账。
 *
 * ⚠️ 微信 App 支付的 `success` 只代表**用户完成了支付动作**，不代表钱已入账
 * （用户可能在微信侧确认后、回调抵达前就退出 App）。因此必须轮询到
 * 服务端返回 status=2 才展示成功，否则会出现「显示成功但后台查无此单」。
 */
async function donateViaWxApp() {
  const tier = selectedTier.value;
  if (!tier) return;

  paying.value = true;
  _alive = true;
  validateMsg.value = "";

  try {
    // 1. 服务端下单（金额单位：分）
    maskText.value = "创建订单...";
    const order = await donateApi.createOrder(tier.amountCents, "wx_app");

    if (!order?.order_info) {
      // 后端返回了 200 但没有 order_info，说明渠道分发或配置有问题，不能继续调起
      console.error("[donate] wx_app order missing order_info", order);
      validateMsg.value = "支付通道暂时不可用，请稍后重试";
      return;
    }

    // 2. 调起微信 App 支付（orderInfo 原样透传，客户端不解析也不重组）
    maskText.value = "拉起微信支付...";
    await requestWxAppPay({ orderInfo: order.order_info });

    if (!_alive) return;

    // 3. 轮询等回调入账（不能用微信的 success 当作已支付）
    maskText.value = "确认支付结果...";
    const paid = await waitOrderPaid(order.out_trade_no);

    showSuccess(paid.amount);
  } catch (e) {
    // 用户取消不是错误，保持页面原状不打扰
    const err = e as { code?: string; message?: string };
    if (err?.code === NativePayErrorCode.CANCELLED) return;
    console.error("[donate] wechat app pay error:", e);
    validateMsg.value = err?.message || "支付失败，请稍后重试";
  } finally {
    paying.value = false;
  }
}

/**
 * 轮询订单状态直到服务端确认入账。
 *
 * 返回已支付订单；关单（3）立即终止（订单不可能再支付了，继续等是浪费用户时间）；
 * 超时抛错由调用方转成提示语。
 *
 * 查询走 silent：轮询期间页面被全屏 mask 遮着，失败重试是预期行为，
 * 不该每次都弹全局 toast（既被遮住、又会在 mask 关闭后突然闪现）。
 */
async function waitOrderPaid(outTradeNo: string) {
  const deadline = Date.now() + ORDER_CONFIRM_TIMEOUT;

  for (let attempt = 0; ; attempt++) {
    const order = await donateApi.queryOrder(outTradeNo, { silent: true });

    if (order.status === 2) return order;
    if (order.status === 3) {
      throw new Error("订单已关闭，若已扣款请稍后查看余额");
    }
    if (Date.now() >= deadline) {
      throw new Error("支付结果确认超时，若已扣款请稍后查看余额");
    }

    await sleep(POLL_DELAYS[Math.min(attempt, POLL_DELAYS.length - 1)]);
  }
}

/** 显示成功反馈 */
function showSuccess(amountCents: number) {
  successAmount.value = formatYuan(amountCents);
  successVisible.value = true;
}

function onSuccessClose() {
  successVisible.value = false;
  uni.navigateBack();
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ─── 顶部 ─── */
.preview-tip {
  display: block;
  margin: 0 24rpx 12rpx;
  padding: 10rpx 20rpx;
  border-radius: 12rpx;
  background: #e6f7f4;
  color: #0f766e;
  font-size: 20rpx;
  line-height: 1.5;
}
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
  background: rgba(13, 148, 136, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}
.nav-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #134e4a;
  letter-spacing: 2rpx;
}

/* ─── Hero ─── */
.hero {
  margin: 8rpx 24rpx 24rpx;
  padding: 32rpx 32rpx;
  border-radius: 32rpx;
  background: linear-gradient(150deg, #f0fdfa 0%, #ccfbf1 100%);
  border: 1rpx solid rgba(13, 148, 136, 0.12);
  box-shadow: 0 12rpx 32rpx rgba(13, 148, 136, 0.08);
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
  background: rgba(94, 234, 212, 0.28);
}
.hero::after {
  content: "";
  position: absolute;
  bottom: -80rpx;
  left: -80rpx;
  width: 200rpx;
  height: 200rpx;
  border-radius: 50%;
  background: rgba(45, 212, 191, 0.16);
}
.hero-title {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
  color: #0f766e;
  letter-spacing: 1rpx;
  margin-bottom: 14rpx;
  position: relative;
  z-index: 1;
}
.hero-sub {
  display: block;
  font-size: 24rpx;
  color: #3f7d76;
  line-height: 1.75;
  position: relative;
  z-index: 1;
}

/* ─── 卡片通用 ─── */
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
  color: #134e4a;
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

/* ─── 金额选择 ─── */
.amount-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 18rpx;
}
.amount-btn {
  flex: 1 1 calc(33.33% - 12rpx);
  min-width: calc(33.33% - 12rpx);
  box-sizing: border-box;
  height: 140rpx;
  border-radius: 24rpx;
  background: #f7fbfa;
  border: 2rpx solid rgba(13, 148, 136, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  transition: all 0.2s ease;
}
.amount-btn--active {
  background: linear-gradient(150deg, #ccfbf1 0%, #5eead4 100%);
  border-color: #0d9488;
  transform: scale(1.03);
  box-shadow: 0 8rpx 20rpx rgba(13, 148, 136, 0.18);
}
.amount-symbol {
  font-size: 24rpx;
  color: #8fa8a4;
}
.amount-num {
  font-size: 40rpx;
  font-weight: 700;
  color: #2f4f4b;
}
.amount-btn--active .amount-symbol {
  color: #0f766e;
}
.amount-btn--active .amount-num {
  color: #0f766e;
}

.amount-validate {
  margin-top: 16rpx;
  min-height: 32rpx;
}
.amount-validate__msg {
  font-size: 22rpx;
  color: #ff4d4f;
}

/* iOS 应用内购买提示（压成一行） */
.iap-note {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #aaa;
}

/* ─── 资金去向 ─── */
.usage {
  margin: 24rpx 24rpx 0;
  background: #fff;
  border-radius: 30rpx;
  padding: 28rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.05);
}
.usage-title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #134e4a;
  margin-bottom: 20rpx;
}
.usage-bar {
  display: flex;
  height: 24rpx;
  border-radius: 12rpx;
  overflow: hidden;
}
.usage-bar__seg {
  height: 100%;
}
.usage-legend {
  margin-top: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.usage-legend__row {
  display: flex;
  align-items: center;
  font-size: 24rpx;
  color: #555;
}
.usage-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 7rpx;
  margin-right: 12rpx;
  flex-shrink: 0;
}
.usage-label {
  flex: 1;
}
.usage-pct {
  font-weight: 700;
  color: #134e4a;
}

/* ─── 一行承诺 ─── */
.fineprint {
  display: block;
  margin: 20rpx 40rpx 0;
  font-size: 20rpx;
  color: #aaa;
  text-align: center;
  line-height: 1.6;
}

.bottom-spacer {
  height: 160rpx;
}

/* ─── 底部支付栏 ─── */
.pay-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  box-shadow: 0 -8rpx 24rpx rgba(0, 0, 0, 0.06);
  padding: 24rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
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
  color: #0f766e;
  font-weight: 600;
}
.pay-info__num {
  font-size: 38rpx;
  font-weight: 800;
  color: #0f766e;
}
.pay-btn {
  flex: 1;
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 48rpx;
  background: linear-gradient(135deg, #5eead4 0%, #2dd4bf 100%);
  color: #065f46;
  font-size: 32rpx;
  font-weight: 700;
  text-align: center;
  border: none;
  box-shadow: 0 8rpx 20rpx rgba(13, 148, 136, 0.22);
  transition: all 0.2s ease;
}
.pay-btn::after {
  border: none;
}
.pay-btn--disabled {
  background: #e2e8e6;
  color: #94a3a0;
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
  border: 4rpx solid rgba(6, 95, 70, 0.25);
  border-top-color: #065f46;
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
  background: rgba(15, 60, 55, 0.45);
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
  border: 6rpx solid #e6f7f4;
  border-top-color: #0d9488;
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
  background: rgba(15, 60, 55, 0.5);
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
  background: linear-gradient(150deg, #ccfbf1 0%, #5eead4 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 30rpx;
  box-shadow: 0 12rpx 32rpx rgba(13, 148, 136, 0.18);
}
.success-tick {
  font-size: 80rpx;
  color: #0f766e;
  font-weight: 700;
  line-height: 1;
}
.success-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #0f766e;
  margin-bottom: 16rpx;
}
.success-amount {
  font-size: 30rpx;
  color: #0f766e;
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
  background: linear-gradient(135deg, #5eead4 0%, #2dd4bf 100%);
  color: #065f46;
  font-size: 30rpx;
  font-weight: 700;
  border: none;
}
.success-btn::after {
  border: none;
}
</style>
