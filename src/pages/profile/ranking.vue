<!--
  pages/profile/ranking  贡献榜
  ─────────────────────────────────────────────
  入口:  个人中心「贡献榜」/ 上传情报页「贡献榜」

  作用: 肯定「上传情报（众包演出线索）」的用户 —— 情报被运营核实收录后计入贡献，
        排名次、给星币、给出「再收录 N 条即可超过上一名」的追赶目标，
        让继续上传变成一件有即时反馈的事。

  布局（自上而下）:
    1. 自定义导航(返回 + 标题 + 规则)
    2. Hero(标题 + 引导语 + 周期切换: 总榜/本月榜/本周榜)
    3. 我的贡献卡(名次 / 收录条数 / 星币 / 追赶文案 / 进度条 / 去上传)
    4. 前三名领奖台
    5. 其余名次列表(「我」的行高亮)
    6. 底部固定「上传情报 · 赚星币」按钮
    7. 规则弹窗(uni-popup)

  口径（与后端一致, 不要在页面里另算一套）:
    - 排序依据 = 运营核实收录的情报条数（每条 10 星币）
    - 月榜 / 周榜按「被收录」的时间算, 与发放星币的时间一致
-->
<template>
  <PageLayout>
    <view class="page">
      <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
        <uni-icons type="left" size="large" color="#333" @click="goBack" />
        <text class="nav-title">贡献榜</text>
        <view class="nav-rule" @click="openRule">
          <uni-icons type="info" size="16" color="#8A8F99" />
          <text class="nav-rule__text">规则</text>
        </view>
      </view>

      <scroll-view scroll-y class="scroll-body" @scrolltolower="loadMore">
        <!-- Hero -->
        <view class="hero">
          <text class="hero-title">贡献榜</text>
          <text class="hero-sub">你看到的每一场演出，都有人先发现了它</text>
          <view class="tabs">
            <view
              v-for="t in PERIODS"
              :key="t.key"
              class="tab"
              :class="{ 'tab--on': period === t.key }"
              @click="switchPeriod(t.key)"
            >
              <text class="tab-text" :class="{ 'tab-text--on': period === t.key }">{{
                t.label
              }}</text>
            </view>
          </view>
        </view>

        <!-- 我的贡献 -->
        <view class="my-card">
          <!-- 未登录 -->
          <view v-if="!isLoggedIn" class="my-empty">
            <text class="my-empty__title">登录后查看你的名次</text>
            <text class="my-empty__desc">登录即可看到自己的贡献排名与追赶目标</text>
            <button class="my-btn" @click="onLoginTap">去登录</button>
          </view>

          <!-- 已登录但本期没上榜 -->
          <view v-else-if="!onBoard" class="my-empty">
            <text class="my-empty__title">你还没有上榜记录</text>
            <text class="my-empty__desc"
              >上传第一条情报，运营核实收录后即可上榜，并获得 10 星币</text
            >
            <button class="my-btn" @click="goSubmit">上传第一条情报</button>
          </view>

          <!-- 已上榜 -->
          <view v-else>
            <view class="my-head">
              <text class="my-label">我的{{ periodLabel }}排名</text>
              <text class="my-stars">★ {{ me?.star_coins ?? 0 }} {{ starLabel }}</text>
            </view>
            <view class="my-rank">
              <text class="my-rank__num">#{{ myRank }}</text>
              <text class="my-rank__meta"
                >收录 {{ me?.adopted_count ?? 0 }} 条 · 共 {{ total }} 人上榜</text
              >
            </view>

            <view v-if="chaseText" class="my-chase">
              <uni-icons type="medal-filled" size="16" color="#FEA500" />
              <text class="my-chase__text">{{ chaseText }}</text>
            </view>

            <!-- 进度条：我的条数 / 上一名的条数 -->
            <view v-if="showProgress" class="my-bar">
              <view class="my-bar__fill" :style="{ width: progress + '%' }" />
            </view>

            <button class="my-btn my-btn--flat" @click="goSubmit">再上传一条情报</button>
          </view>
        </view>

        <!-- 加载中 -->
        <view v-if="loading && list.length === 0" class="state">
          <text class="state__text">加载中…</text>
        </view>

        <!-- 加载失败 -->
        <view v-else-if="loadError && list.length === 0" class="state">
          <text class="state__text">{{ loadError }}</text>
          <text class="state__retry" @click="reload">重新加载</text>
        </view>

        <!-- 还没有人上榜 -->
        <view v-else-if="list.length === 0" class="state">
          <text class="state__text">本期还没有人上榜</text>
          <text class="state__hint">上传第一条情报，抢占第一个位置</text>
        </view>

        <template v-else>
          <!-- 前三名领奖台 -->
          <view class="podium">
            <view
              v-for="p in podium"
              :key="p.rank"
              class="pod"
              :class="'pod--' + p.rank"
              @click="openCard(p.user_id)"
            >
              <view class="pod__crown">
                <uni-icons type="medal-filled" size="20" :color="medalColor(p.rank)" />
              </view>
              <image class="pod__avatar" :src="avatarOf(p)" mode="aspectFill" />
              <view class="pod__name-row">
                <text class="pod__name">{{ nameOf(p) }}</text>
                <text v-if="p.is_me" class="row__me-tag">我</text>
              </view>
              <view class="pod__base">
                <text class="pod__rank">{{ p.rank }}</text>
                <text class="pod__count">{{ p.adopted_count }} 条</text>
              </view>
            </view>
          </view>

          <!-- 其余名次 -->
          <view class="list">
            <view
              v-for="item in restRows"
              :key="item.rank"
              class="row"
              :class="{ 'row--me': item.is_me }"
              @click="openCard(item.user_id)"
            >
              <text class="row__no">{{ item.rank }}</text>
              <image class="row__avatar" :src="avatarOf(item)" mode="aspectFill" />
              <view class="row__main">
                <view class="row__name-row">
                  <text class="row__name">{{ nameOf(item) }}</text>
                  <text v-if="item.is_me" class="row__me-tag">我</text>
                </view>
                <text class="row__sub">{{ item.adopted_count }} 条情报被收录</text>
              </view>
              <view class="row__right">
                <text class="row__stars">★ {{ item.star_coins }}</text>
                <text class="row__unit">{{ starLabel }}</text>
              </view>
            </view>
          </view>

          <view class="load-more">
            <text v-if="loadingMore" class="load-more__text">加载中…</text>
            <text v-else-if="list.length < total" class="load-more__text" @click="loadMore"
              >上拉加载更多</text
            >
            <text v-else class="load-more__text">已加载全部 {{ total }} 人</text>
          </view>
        </template>

        <view class="bottom-spacer" />
      </scroll-view>

      <!-- 底部 CTA -->
      <view class="cta-bar">
        <button class="cta-btn" @click="goSubmit">上传情报 · 赚星币</button>
      </view>

      <!-- 贡献者卡片（点榜单行打开） -->
      <uni-popup
        ref="cardPopup"
        type="center"
        background-color="transparent"
        :is-mask-click="true"
        class="card-popup"
      >
        <view class="card">
          <view class="card__head">
            <image class="card__avatar" :src="cardAvatar" mode="aspectFill" />
            <view class="card__ident">
              <text class="card__name">{{ cardName }}</text>
              <text v-if="cardBio" class="card__bio">{{ cardBio }}</text>
            </view>
          </view>

          <view v-if="cardLoading" class="card__state">
            <text class="card__state__text">加载中…</text>
          </view>
          <view v-else-if="cardError" class="card__state">
            <text class="card__state__text">{{ cardError }}</text>
          </view>
          <template v-else-if="cardProfile">
            <!-- 成绩 -->
            <view class="card__stats">
              <view class="card__stat">
                <text class="card__stat__num">{{ cardProfile.stats.adopted_count }}</text>
                <text class="card__stat__label">累计收录</text>
              </view>
              <view class="card__stat">
                <text class="card__stat__num card__stat__num--gold">{{
                  cardProfile.stats.star_coins
                }}</text>
                <text class="card__stat__label">累计星币</text>
              </view>
              <view class="card__stat">
                <text class="card__stat__num card__stat__num--rank">{{ cardRankText }}</text>
                <text class="card__stat__label">总榜名次</text>
              </view>
            </view>

            <!-- 社交主页链接（引流） -->
            <view v-if="cardProfile.social_links.length" class="card__links">
              <view
                v-for="(l, i) in cardProfile.social_links"
                :key="i"
                class="card__chip"
                :style="{ borderColor: metaOf(l.platform).color, color: metaOf(l.platform).color }"
                @click="openCardLink(l.url, l.title)"
              >
                <view class="dot" :style="{ background: metaOf(l.platform).color }" />
                <text class="card__chip__text">{{ l.title || metaOf(l.platform).label }}</text>
              </view>
            </view>

            <button class="card__btn" @click="goCardProfile">查看 TA 的主页</button>
          </template>
        </view>
      </uni-popup>

      <!-- 规则弹窗 -->
      <uni-popup
        ref="rulePopup"
        type="bottom"
        background-color="#fff"
        :is-mask-click="true"
        class="rule-popup"
      >
        <view class="rule">
          <text class="rule__title">贡献榜规则</text>
          <view class="rule__list">
            <text class="rule__item"
              >1. 你在「上传情报」里提交的演出线索，经运营人工核实并收录进 App 后，
              记为 1 条贡献，折算 10 星币。</text
            >
            <text class="rule__item"
              >2. 排名按贡献条数从多到少排列；条数相同时，先达成的人排在前面。</text
            >
            <text class="rule__item"
              >3. 总榜看累计贡献；本月榜 / 本周榜按「被收录」的时间统计，
              与发放星币的时间一致。</text
            >
            <text class="rule__item"
              >4. 只有贡献被收录过的账号才会上榜；账号被封禁或申请注销后不再展示。</text
            >
            <text class="rule__item"
              >5. 榜单会展示昵称、头像与贡献条数。不希望出现在榜单上，可通过
              「我的 - 通用 - 关于我们 - 意见反馈」联系我们下榜。</text
            >
          </view>
          <button class="rule__btn" @click="closeRule">知道了</button>
        </view>
      </uni-popup>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import PageLayout from '@/components/PageLayout/index.vue'
import { rankApi } from '@/api/rank'
import { useUserStore } from '@/stores/user'
import { getNavBarMetrics } from '@/utils/system'
import { getUserAvatarSrc } from '@/utils/avatar'
import { openExternalUrl } from '@/utils/openExternal'
import { publicUserApi } from '@/api/social'
import { socialPlatformMeta } from '@/constants/social'
import type { PublicUserProfile } from '@/types/social'
import type { RankingItem, RankingMe, RankingPeriod } from '@/types/rank'

const PAGE_SIZE = 20

const PERIODS: { key: RankingPeriod; label: string }[] = [
  { key: 'all', label: '总榜' },
  { key: 'month', label: '本月榜' },
  { key: 'week', label: '本周榜' },
]

const userStore = useUserStore()
const isLoggedIn = computed(() => userStore.isLoggedIn)

const { statusBarHeight } = getNavBarMetrics()

const period = ref<RankingPeriod>('all')
const list = ref<RankingItem[]>([])
const me = ref<RankingMe | undefined>(undefined)
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref('')

const rulePopup = ref<any>(null)

// ─── 贡献者卡片 ───
const cardPopup = ref<any>(null)
const cardProfile = ref<PublicUserProfile | null>(null)
const cardLoading = ref(false)
const cardError = ref('')

const cardName = computed(() => cardProfile.value?.user.nickname || '未设置昵称')
const cardBio = computed(() => cardProfile.value?.user.bio || '')
const cardAvatar = computed(() =>
  cardProfile.value
    ? getUserAvatarSrc({
        avatar_url: cardProfile.value.user.avatar_url,
        gender: cardProfile.value.user.gender,
      })
    : '',
)
const cardRankText = computed(() => {
  const r = cardProfile.value?.stats.rank ?? 0
  return r > 0 ? `#${r}` : '未上榜'
})

// ─── 派生 ───
const myRank = computed(() => me.value?.rank ?? 0)
const onBoard = computed(() => myRank.value > 0)

const periodLabel = computed(() => {
  if (period.value === 'all') return '累计'
  if (period.value === 'month') return '本月'
  return '本周'
})

/**
 * 星币口径标签。
 *
 * 榜单里的 star_coins 是**按周期派生**的（条数 × 10），不是账户里的累计值；
 * 贡献者卡片里的 star_coins 才是 user_profiles 的真实累计。
 * 两个数放在一起看时必须区分，否则用户会以为榜单算错了。
 */
const starLabel = computed(() => (period.value === 'all' ? '累计星币' : '本期星币'))

/** 追赶文案：第一名给鼓励，其余给「还差几条」 */
const chaseText = computed(() => {
  if (!me.value || !onBoard.value) return ''
  if (me.value.rank === 1) return `${periodLabel.value}第一名，继续保持！再来一条就更稳了`
  if (me.value.gap_to_next > 0) return `再收录 ${me.value.gap_to_next} 条即可超过上一名`
  return ''
})

/** 进度条只在「我上面有人」时才有意义（第一名没有上一名可追） */
const showProgress = computed(() => onBoard.value && myRank.value > 1)

const progress = computed(() => {
  const prev = me.value?.prev_adopted_count ?? 0
  const mine = me.value?.adopted_count ?? 0
  if (prev <= 0) return 100
  return Math.min(100, Math.round((mine / prev) * 100))
})

/** 领奖台：视觉顺序 2 - 1 - 3 */
const podium = computed(() => {
  const [first, second, third] = list.value
  const arr: RankingItem[] = []
  if (second) arr.push(second)
  if (first) arr.push(first)
  if (third) arr.push(third)
  return arr
})

const restRows = computed(() => list.value.slice(3))

function nameOf(item: RankingItem) {
  return item.nickname || '未设置昵称'
}

/** 领奖台前三名的奖牌颜色：金 / 银 / 铜 */
function medalColor(rank: number) {
  if (rank === 1) return '#FFB300'
  if (rank === 2) return '#B9BEC7'
  return '#D18B5C'
}

function avatarOf(item: RankingItem) {
  return getUserAvatarSrc({ avatar_url: item.avatar_url, gender: item.gender })
}

// ─── 数据 ───
/**
 * 请求序号：切换周期时旧的请求可能还在路上。
 * 只有「最后一次发起的请求」的结果才允许写进界面，
 * 否则会出现「切到本月榜，却显示总榜数据」（旧响应后到覆盖新响应）。
 */
let reqId = 0

async function fetchPage(p: number, append: boolean) {
  const myId = ++reqId
  try {
    const r = await rankApi.list({ period: period.value, page: p, page_size: PAGE_SIZE })
    if (myId !== reqId) return
    const rows = r?.list || []
    list.value = append ? list.value.concat(rows) : rows
    me.value = r?.me
    total.value = r?.total || 0
    page.value = p
    loadError.value = ''
  } catch (e: any) {
    if (myId !== reqId) return
    loadError.value = e?.message || '榜单加载失败'
  }
}

async function reload() {
  loading.value = true
  await fetchPage(1, false)
  loading.value = false
}

async function loadMore() {
  if (loading.value || loadingMore.value) return
  if (list.value.length >= total.value) return
  loadingMore.value = true
  await fetchPage(page.value + 1, true)
  loadingMore.value = false
}

function switchPeriod(p: RankingPeriod) {
  if (period.value === p) return
  period.value = p
  list.value = []
  me.value = undefined
  total.value = 0
  void reload()
}

// 从别的页面返回时刷新：用户可能刚提交了新的情报，名次与贡献数要跟着变。
onShow(() => {
  void reload()
})

// ─── 交互 ───
function goBack() {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.switchTab({ url: '/pages/profile/index' })
}

function goSubmit() {
  userStore.requireLogin({
    dismissible: true,
    reason: 'ranking_upload',
    onSuccess: () => {
      uni.navigateTo({ url: '/pages/event/submit' })
    },
  })
}

function onLoginTap() {
  userStore.requireLogin({ dismissible: true, reason: 'ranking_login' })
}

function openRule() {
  rulePopup.value?.open?.('bottom')
}

function closeRule() {
  rulePopup.value?.close?.()
}

// ─── 贡献者卡片 ───
/**
 * 打开某个用户的贡献者卡片。
 *
 * 卡片内容（成绩 / 个性化 / 社交主页链接）来自
 * GET /public/users/:id/profile —— 公开可读，与榜单的可见性保持一致。
 */
async function openCard(userId: number) {
  if (!userId) return
  cardProfile.value = null
  cardError.value = ''
  cardLoading.value = true
  cardPopup.value?.open?.('center')
  try {
    cardProfile.value = await publicUserApi.profile(userId)
  } catch (e: any) {
    cardError.value = e?.message || '加载失败'
  } finally {
    cardLoading.value = false
  }
}

function openCardLink(url: string, label?: string) {
  if (!url) return
  openExternalUrl(url, label || '主页链接')
}

function goCardProfile() {
  const id = cardProfile.value?.user.id
  if (!id) return
  cardPopup.value?.close?.()
  uni.navigateTo({ url: `/pages/profile/homepage?uid=${id}` })
}

function metaOf(platform: string) {
  return socialPlatformMeta(platform)
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  display: flex;
  flex-direction: column;
}

/* ─── 导航 ─── */
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 30rpx 20rpx;
  background: #fff;
  border-bottom: 1rpx solid rgba(236, 236, 236, 1);
}
.nav-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #333;
}
.nav-rule {
  display: flex;
  align-items: center;
  gap: 6rpx;
}
.nav-rule__text {
  font-size: 24rpx;
  color: #8a8f99;
}

.scroll-body {
  flex: 1;
  padding: 0 24rpx;
  box-sizing: border-box;
}

/* ─── Hero ─── */
.hero {
  margin: 20rpx -24rpx 0;
  padding: 30rpx 30rpx 26rpx;
  background: linear-gradient(
    150deg,
    rgba(32, 226, 215, 0.75) 0%,
    rgba(249, 254, 165, 0.85) 100%
  );
  border-radius: 0 0 36rpx 36rpx;
}
.hero-title {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
  color: #222;
}
.hero-sub {
  display: block;
  font-size: 24rpx;
  color: #4a4a4a;
  margin-top: 8rpx;
}
.tabs {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
}
.tab {
  padding: 10rpx 30rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.55);
}
.tab--on {
  background: #fff;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.08);
}
.tab-text {
  font-size: 26rpx;
  color: #555;
}
.tab-text--on {
  color: #222;
  font-weight: 700;
}

/* ─── 我的贡献 ─── */
.my-card {
  margin-top: 20rpx;
  background: #fff;
  border-radius: 30rpx;
  padding: 28rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.05);
}
.my-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.my-label {
  font-size: 26rpx;
  color: #888;
}
.my-stars {
  font-size: 24rpx;
  font-weight: 700;
  color: #ff8c00;
}
.my-rank {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
  margin-top: 10rpx;
}
.my-rank__num {
  font-size: 72rpx;
  font-weight: 800;
  color: #fea500;
  line-height: 1;
}
.my-rank__meta {
  font-size: 24rpx;
  color: #666;
}
.my-chase {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 18rpx;
  padding: 16rpx 20rpx;
  background: rgba(254, 165, 0, 0.1);
  border-radius: 16rpx;
}
.my-chase__text {
  font-size: 24rpx;
  color: #c9760a;
  flex: 1;
}
.my-bar {
  height: 12rpx;
  border-radius: 6rpx;
  background: #f0f0f0;
  margin-top: 16rpx;
  overflow: hidden;
}
.my-bar__fill {
  height: 100%;
  border-radius: 6rpx;
  background: linear-gradient(90deg, #ffd200 0%, #fea500 100%);
}
.my-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}
.my-empty__title {
  font-size: 30rpx;
  font-weight: 700;
  color: #333;
}
.my-empty__desc {
  font-size: 24rpx;
  color: #888;
  text-align: center;
  line-height: 1.6;
}
.my-btn {
  margin-top: 16rpx;
  width: 100%;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 40rpx;
  background: linear-gradient(135deg, #fea500 0%, #ffd200 100%);
  color: #fff;
  font-size: 28rpx;
  font-weight: 700;
  border: none;
}
.my-btn::after {
  border: none;
}
.my-btn--flat {
  margin-top: 24rpx;
  background: rgba(254, 165, 0, 0.12);
  color: #d98600;
}

/* ─── 状态 ─── */
.state {
  padding: 70rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
}
.state__text {
  font-size: 27rpx;
  color: #999;
}
.state__hint {
  font-size: 24rpx;
  color: #bbb;
}
.state__retry {
  font-size: 26rpx;
  color: #fea500;
}

/* ─── 领奖台 ─── */
.podium {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 12rpx;
  margin-top: 24rpx;
}
.pod {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.pod__crown {
  height: 40rpx;
  display: flex;
  align-items: center;
}
.pod__avatar {
  width: 92rpx;
  height: 92rpx;
  border-radius: 50%;
  border: 4rpx solid #fff;
  background: #f0f0f0;
  box-shadow: 0 6rpx 18rpx rgba(0, 0, 0, 0.1);
}
.pod--1 .pod__avatar {
  width: 118rpx;
  height: 118rpx;
  border-color: #ffb300;
}
.pod__name-row {
  display: flex;
  align-items: center;
  margin-top: 12rpx;
  max-width: 190rpx;
}
.pod__name {
  font-size: 24rpx;
  color: #333;
  max-width: 190rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pod__base {
  margin-top: 14rpx;
  width: 100%;
  border-radius: 18rpx 18rpx 0 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 16rpx;
}
.pod--1 .pod__base {
  height: 150rpx;
  background: linear-gradient(180deg, #ffc93c 0%, #ffb300 100%);
}
.pod--2 .pod__base {
  height: 112rpx;
  background: linear-gradient(180deg, #d3d7de 0%, #bcc2cb 100%);
}
.pod--3 .pod__base {
  height: 88rpx;
  background: linear-gradient(180deg, #e8a87c 0%, #d18b5c 100%);
}
.pod__rank {
  font-size: 40rpx;
  font-weight: 800;
  color: #fff;
  line-height: 1.1;
}
.pod__count {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.9);
  margin-top: 4rpx;
}

/* ─── 列表 ─── */
.list {
  margin-top: 8rpx;
}
.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  background: #fff;
  border-radius: 24rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  padding: 20rpx 24rpx;
  margin-top: 16rpx;
}
.row--me {
  border-color: #fea500;
  background: linear-gradient(180deg, #fffdf6 0%, #ffffff 100%);
}
.row__no {
  width: 46rpx;
  text-align: center;
  font-size: 28rpx;
  font-weight: 700;
  color: #999;
}
.row__avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: #f0f0f0;
  flex-shrink: 0;
}
.row__main {
  flex: 1;
  min-width: 0;
}
.row__name-row {
  display: flex;
  align-items: center;
}
.row__name {
  font-size: 27rpx;
  color: #333;
  max-width: 280rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row__me-tag {
  margin-left: 10rpx;
  padding: 0 10rpx;
  border-radius: 8rpx;
  background: #fea500;
  color: #fff;
  font-size: 18rpx;
  line-height: 30rpx;
}
.row__sub {
  display: block;
  font-size: 22rpx;
  color: #aaa;
  margin-top: 4rpx;
}
.row__right {
  text-align: right;
}
.row__stars {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #ff8c00;
}
.row__unit {
  font-size: 20rpx;
  color: #bbb;
}

.load-more {
  padding: 30rpx 0 10rpx;
  text-align: center;
}
.load-more__text {
  font-size: 24rpx;
  color: #bbb;
}

.bottom-spacer {
  height: 160rpx;
}

/* ─── 底部 CTA ─── */
.cta-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -8rpx 24rpx rgba(0, 0, 0, 0.06);
  z-index: 10;
}
.cta-btn {
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
.cta-btn::after {
  border: none;
}

/* ─── 规则弹窗 ─── */
.rule {
  background: #fff;
  border-radius: 30rpx 30rpx 0 0;
  padding: 40rpx 36rpx calc(40rpx + env(safe-area-inset-bottom));
}
.rule__title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #333;
  margin-bottom: 24rpx;
}
.rule__list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}
.rule__item {
  font-size: 25rpx;
  color: #666;
  line-height: 1.7;
}
.rule__btn {
  margin-top: 36rpx;
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
.rule__btn::after {
  border: none;
}

/* ─── 贡献者卡片 ─── */
.card {
  background: #fff;
  border-radius: 30rpx;
  width: 620rpx;
  padding: 40rpx 36rpx 36rpx;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.15);
}
.card__head {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.card__avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 48rpx;
  background: #f0f0f0;
  flex-shrink: 0;
}
.card__ident {
  flex: 1;
  min-width: 0;
}
.card__name {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card__bio {
  display: block;
  font-size: 24rpx;
  color: #888;
  margin-top: 8rpx;
  line-height: 1.5;
}
.card__state {
  padding: 50rpx 0;
  text-align: center;
}
.card__state__text {
  font-size: 26rpx;
  color: #999;
}
.card__stats {
  margin-top: 28rpx;
  display: flex;
  align-items: center;
  background: #fafafa;
  border-radius: 20rpx;
  padding: 24rpx 0;
}
.card__stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
}
.card__stat__num {
  font-size: 34rpx;
  font-weight: 800;
  color: #333;
}
.card__stat__num--gold {
  color: #ff8c00;
}
.card__stat__num--rank {
  color: #fea500;
}
.card__stat__label {
  font-size: 21rpx;
  color: #999;
}
.card__links {
  margin-top: 24rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}
.card__chip {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 10rpx 20rpx;
  border: 1rpx solid #ddd;
  border-radius: 999rpx;
}
.card__chip__text {
  font-size: 24rpx;
  font-weight: 600;
}
.dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 7rpx;
}
.card__btn {
  margin-top: 32rpx;
  width: 100%;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 42rpx;
  background: linear-gradient(135deg, #fea500 0%, #ffd200 100%);
  color: #fff;
  font-size: 29rpx;
  font-weight: 700;
  border: none;
}
.card__btn::after {
  border: none;
}
</style>

<style>
/* 弹窗层级要高于底部固定 CTA（z-index: 10）*/
.rule-popup {
  z-index: 9999 !important;
}
.card-popup {
  z-index: 9999 !important;
}
</style>
