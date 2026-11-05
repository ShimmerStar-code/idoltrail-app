<!--
  pages/profile/homepage  我的主页 / 他人主页
  ─────────────────────────────────────────────
  入口:
    - 个人中心「我的主页」→ 自己的主页（可编辑社交链接）
    - 贡献榜点某人 → 「查看 TA 的主页」→ 他人主页（只读）

  这页是「引流工具」的落点:
    1. 成绩(收录条数 / 星币 / 名次) —— 让贡献被看见
    2. 个性化(头像 / 昵称 / 签名 / 加入时间)
    3. 社交主页链接(小红书 / 微博 / B站 / 公众号 / 抖音 / 其他) —— 粉丝的出口

  注意:
    - 社交链接是**用户主动填写**的公开信息，默认不填 = 不展示
    - 链接的合法性(平台白名单 / 域名白名单)由服务端校验，前端只做提示
    - 未登录也能看别人的主页（公开可读）
-->
<template>
  <PageLayout>
    <view class="page">
      <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
        <uni-icons type="left" size="large" color="#333" @click="goBack" />
        <text class="nav-title">{{ isMe ? '我的主页' : 'TA 的主页' }}</text>
        <view class="nav-action" @click="onShare">
          <uni-icons type="paperplane" size="18" color="#8A8F99" />
        </view>
      </view>

      <scroll-view scroll-y class="scroll-body">
        <!-- 加载中 -->
        <view v-if="loading && !profile" class="state">
          <text class="state__text">加载中…</text>
        </view>

        <!-- 加载失败 -->
        <view v-else-if="loadError && !profile" class="state">
          <text class="state__text">{{ loadError }}</text>
          <text class="state__retry" @click="load">重新加载</text>
        </view>

        <template v-else-if="profile">
          <!-- 资料卡 -->
          <view class="profile-card">
            <image class="avatar" :src="avatarSrc" mode="aspectFill" />
            <view class="profile-main">
              <view class="name-row">
                <text class="name">{{ profile.user.nickname || '未设置昵称' }}</text>
                <image
                  v-if="genderIcon"
                  class="gender-icon"
                  :src="genderIcon"
                  mode="aspectFit"
                />
              </view>
              <text v-if="profile.user.bio" class="bio">{{ profile.user.bio }}</text>
              <text class="joined">加入于 {{ profile.user.register_at || '—' }}</text>
            </view>
          </view>

          <!-- 成绩 -->
          <view class="stats-card">
            <view class="stat">
              <text class="stat__num">{{ profile.stats.adopted_count }}</text>
              <text class="stat__label">累计收录</text>
            </view>
            <view class="stat__divider" />
            <view class="stat">
              <text class="stat__num stat__num--gold">{{ profile.stats.star_coins }}</text>
              <text class="stat__label">累计星币</text>
            </view>
            <view class="stat__divider" />
            <view class="stat">
              <text class="stat__num stat__num--rank">{{ rankText }}</text>
              <text class="stat__label">总榜名次</text>
            </view>
          </view>

          <!-- 社交主页链接 -->
          <view class="section">
            <view class="section-head">
              <text class="section-title">社交主页</text>
              <text v-if="isMe && !editing" class="section-action" @click="startEdit">编辑</text>
              <text v-else-if="isMe" class="section-action" @click="cancelEdit">取消</text>
            </view>

            <view v-if="editing" class="link-edit-list">
              <view v-for="(l, i) in draft" :key="i" class="link-edit-item">
                <view class="dot" :style="{ background: metaOf(l.platform).color }" />
                <view class="link-edit-main">
                  <text class="link-edit-title">{{ l.title || metaOf(l.platform).label }}</text>
                  <text class="link-edit-url">{{ l.url }}</text>
                </view>
                <view class="link-del" @click="removeLink(i)">
                  <uni-icons type="close" size="16" color="#bbb" />
                </view>
              </view>
              <view
                v-if="draft.length < SOCIAL_LINK_MAX_COUNT"
                class="link-add"
                @click="openAddLink"
              >
                <uni-icons type="plus" size="16" color="#fea500" />
                <text class="link-add__text">添加主页链接</text>
              </view>
            </view>

            <view v-else-if="profile.social_links.length" class="chip-list">
              <view
                v-for="(l, i) in profile.social_links"
                :key="i"
                class="chip"
                :style="{ borderColor: metaOf(l.platform).color, color: metaOf(l.platform).color }"
                @click="openLink(l.url, l.title)"
              >
                <view class="dot" :style="{ background: metaOf(l.platform).color }" />
                <text class="chip__text">{{ l.title || metaOf(l.platform).label }}</text>
                <uni-icons type="right" size="10" :color="metaOf(l.platform).color" />
              </view>
            </view>

            <view v-else class="empty-hint">
              <text class="empty-hint__text">{{
                isMe ? '还没有添加主页链接，分享你的小红书 / 微博 / B站给同好' : 'TA 还没有添加主页链接'
              }}</text>
            </view>
          </view>

          <!-- 收录的演出 -->
          <view class="section">
            <view class="section-head">
              <text class="section-title">{{ isMe ? '我收录的演出' : 'TA 收录的演出' }}</text>
              <text class="section-tip">{{ profile.contributions.length }} 场</text>
            </view>

            <view v-if="profile.contributions.length" class="contrib-list">
              <view
                v-for="c in profile.contributions"
                :key="c.id"
                class="contrib"
                @click="goEvent(c.event_id)"
              >
                <image
                  v-if="c.poster_url"
                  class="contrib__poster"
                  :src="c.poster_url"
                  mode="aspectFill"
                />
                <view v-else class="contrib__poster contrib__poster--empty" />
                <view class="contrib__main">
                  <text class="contrib__title">{{ c.title || '（未命名演出）' }}</text>
                  <text class="contrib__date">{{ dateOf(c) }}</text>
                </view>
                <uni-icons type="right" size="10" color="#ccc" />
              </view>
            </view>
            <view v-else class="empty-hint">
              <text class="empty-hint__text">{{
                isMe ? '还没有被收录的情报，去上传第一条吧' : 'TA 还没有收录过演出'
              }}</text>
            </view>
          </view>
        </template>

        <view class="bottom-spacer" />
      </scroll-view>

      <!-- 底部：编辑态保存 / 视图态去上传 -->
      <view v-if="isMe" class="cta-bar">
        <button v-if="editing" class="cta-btn" @click="save">
          {{ saving ? '保存中…' : '保存' }}
        </button>
        <button v-else class="cta-btn" @click="goSubmit">上传情报 · 赚星币</button>
      </view>

      <!-- 添加链接表单 -->
      <uni-popup
        ref="linkPopup"
        type="bottom"
        background-color="#fff"
        :is-mask-click="true"
        class="link-popup"
      >
        <view class="link-form">
          <text class="link-form__title">添加主页链接</text>

          <picker
            :range="platformLabels"
            :value="formIndex"
            @change="onPlatformChange"
          >
            <view class="link-form__row">
              <text class="link-form__label">平台</text>
              <view class="link-form__value">
                <text>{{ platformLabels[formIndex] }}</text>
                <uni-icons type="right" size="10" color="#bbb" />
              </view>
            </view>
          </picker>

          <view class="link-form__row">
            <text class="link-form__label">名称</text>
            <input
              v-model="form.title"
              class="link-form__input"
              placeholder="选填，如「我的小红书」"
              placeholder-class="ph"
              :maxlength="24"
            />
          </view>

          <view class="link-form__row link-form__row--block">
            <text class="link-form__label">链接</text>
            <input
              v-model="form.url"
              class="link-form__input"
              :placeholder="currentMeta.placeholder"
              placeholder-class="ph"
              :maxlength="300"
            />
            <text class="link-form__hint">{{ currentMeta.hint }}</text>
          </view>

          <text v-if="formError" class="link-form__error">{{ formError }}</text>

          <button class="link-form__btn" @click="submitLink">添加</button>
        </view>
      </uni-popup>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import PageLayout from '@/components/PageLayout/index.vue'
import { publicUserApi, socialApi } from '@/api/social'
import { useUserStore } from '@/stores/user'
import { getNavBarMetrics } from '@/utils/system'
import { getUserAvatarSrc } from '@/utils/avatar'
import { openExternalUrl } from '@/utils/openExternal'
import { sharePage } from '@/utils/share'
import {
  SOCIAL_LINK_MAX_COUNT,
  SOCIAL_PLATFORM_KEYS,
  SOCIAL_PLATFORMS,
  socialPlatformMeta,
} from '@/constants/social'
import type { PublicUserProfile, SocialLink } from '@/types/social'

const userStore = useUserStore()
const { statusBarHeight } = getNavBarMetrics()

const uid = ref(0)
const profile = ref<PublicUserProfile | null>(null)
const loading = ref(false)
const loadError = ref('')

// 编辑态
const editing = ref(false)
const saving = ref(false)
const draft = ref<SocialLink[]>([])

// 添加链接表单
const linkPopup = ref<any>(null)
const formIndex = ref(0)
const form = ref({ title: '', url: '' })
const formError = ref('')

const isMe = computed(() => !!profile.value && profile.value.user.id === userStore.user?.id)

const avatarSrc = computed(() =>
  profile.value
    ? getUserAvatarSrc({
        avatar_url: profile.value.user.avatar_url,
        gender: profile.value.user.gender,
      })
    : '',
)

const genderIcon = computed(() => {
  const g = profile.value?.user.gender
  if (g === 1) return '/static/icons/male.svg'
  if (g === 2) return '/static/icons/female.svg'
  return ''
})

const rankText = computed(() => {
  const r = profile.value?.stats.rank ?? 0
  return r > 0 ? `#${r}` : '未上榜'
})

const platformLabels = SOCIAL_PLATFORMS.map((p) => p.label)
const currentMeta = computed(() => SOCIAL_PLATFORMS[formIndex.value])

function metaOf(platform: string) {
  return socialPlatformMeta(platform)
}

function dateOf(c: { start_date: string | null; reviewed_at: string }): string {
  if (c.start_date) return String(c.start_date).slice(0, 10)
  if (c.reviewed_at) return `收录于 ${c.reviewed_at}`
  return ''
}

// ─── 数据 ───
async function load() {
  if (!uid.value) return
  loading.value = true
  loadError.value = ''
  try {
    profile.value = await publicUserApi.profile(uid.value)
  } catch (e: any) {
    loadError.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

onLoad((options) => {
  const raw = options?.uid
  const parsed = Number(raw)
  if (raw && Number.isFinite(parsed) && parsed > 0) {
    uid.value = parsed
  } else {
    if (!userStore.isLoggedIn) {
      uni.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
      return
    }
    uid.value = userStore.user?.id ?? 0
  }
  void load()
})

onShow(() => {
  // 从「个人信息修改」返回时，头像/昵称/签名可能变了
  if (uid.value && profile.value) void load()
})

// ─── 编辑 ───
function startEdit() {
  draft.value = (profile.value?.social_links || []).map((l) => ({ ...l }))
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  draft.value = []
  formError.value = ''
}

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    const res = await socialApi.saveLinks(draft.value)
    if (profile.value) {
      profile.value.social_links = res?.links || []
    }
    editing.value = false
    uni.showToast({ title: '已保存', icon: 'success' })
  } catch {
    // request.ts 已弹 toast，这里不重复弹
  } finally {
    saving.value = false
  }
}

function openAddLink() {
  formIndex.value = 0
  form.value = { title: '', url: '' }
  formError.value = ''
  linkPopup.value?.open?.('bottom')
}

function onPlatformChange(e: { detail: { value: string | number } }) {
  formIndex.value = +e.detail.value
  formError.value = ''
}

function removeLink(i: number) {
  draft.value.splice(i, 1)
}

function submitLink() {
  const platform = SOCIAL_PLATFORM_KEYS[formIndex.value] || 'other'
  const url = form.value.url.trim()
  if (!url) {
    formError.value = '请填写链接'
    return
  }
  if (!/^https?:\/\//i.test(url)) {
    formError.value = '链接需要以 http:// 或 https:// 开头'
    return
  }
  if (draft.value.length >= SOCIAL_LINK_MAX_COUNT) {
    formError.value = `最多只能添加 ${SOCIAL_LINK_MAX_COUNT} 个主页链接`
    return
  }
  draft.value.push({
    platform,
    title: form.value.title.trim() || SOCIAL_PLATFORMS[formIndex.value].label,
    url,
  })
  linkPopup.value?.close?.()
}

// ─── 交互 ───
function openLink(url: string, label?: string) {
  if (!url) return
  openExternalUrl(url, label || '主页链接')
}

function goEvent(eventId: number | null) {
  if (!eventId) return
  uni.navigateTo({ url: `/pages/event/detail?id=${eventId}` })
}

function goSubmit() {
  userStore.requireLogin({
    dismissible: true,
    reason: 'homepage_upload',
    onSuccess: () => {
      uni.navigateTo({ url: '/pages/event/submit' })
    },
  })
}

function onShare() {
  if (!profile.value) return
  const r = profile.value.stats.rank
  const summary =
    r > 0
      ? `我在 idoltrail 贡献榜排第 ${r} 名，已帮 App 收录 ${profile.value.stats.adopted_count} 场演出`
      : `我在 idoltrail 上传演出情报，已帮 App 收录 ${profile.value.stats.adopted_count} 场演出`
  sharePage(
    '/pages/profile/homepage',
    { uid: profile.value.user.id },
    summary,
  )
}

function goBack() {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.switchTab({ url: '/pages/profile/index' })
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
.nav-action {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scroll-body {
  flex: 1;
  padding: 20rpx 24rpx 0;
  box-sizing: border-box;
}

/* ─── 资料卡 ─── */
.profile-card {
  display: flex;
  gap: 24rpx;
  background: #fff;
  border-radius: 30rpx;
  padding: 28rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.05);
}
.avatar {
  width: 140rpx;
  height: 140rpx;
  border-radius: 70rpx;
  background: #f0f0f0;
  flex-shrink: 0;
}
.profile-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  justify-content: center;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.name {
  font-size: 34rpx;
  font-weight: 700;
  color: #333;
}
.gender-icon {
  width: 32rpx;
  height: 32rpx;
}
.bio {
  font-size: 25rpx;
  color: #666;
  line-height: 1.6;
}
.joined {
  font-size: 22rpx;
  color: #aaa;
}

/* ─── 成绩 ─── */
.stats-card {
  margin-top: 20rpx;
  background: #fff;
  border-radius: 30rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.05);
  padding: 28rpx 0;
  display: flex;
  align-items: center;
}
.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}
.stat__num {
  font-size: 40rpx;
  font-weight: 800;
  color: #333;
}
.stat__num--gold {
  color: #ff8c00;
}
.stat__num--rank {
  color: #fea500;
}
.stat__label {
  font-size: 22rpx;
  color: #999;
}
.stat__divider {
  width: 1rpx;
  height: 48rpx;
  background: #f0f0f0;
}

/* ─── 区块 ─── */
.section {
  margin-top: 20rpx;
  background: #fff;
  border-radius: 30rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.05);
  padding: 28rpx;
}
.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}
.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
}
.section-action {
  font-size: 25rpx;
  color: #fea500;
}
.section-tip {
  font-size: 22rpx;
  color: #aaa;
}

/* ─── 社交链接 ─── */
.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.chip {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 12rpx 20rpx;
  border: 1rpx solid #ddd;
  border-radius: 999rpx;
}
.dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 7rpx;
}
.chip__text {
  font-size: 25rpx;
  font-weight: 600;
}

.link-edit-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.link-edit-item {
  display: flex;
  align-items: center;
  gap: 14rpx;
  background: #f7f7f7;
  border-radius: 18rpx;
  padding: 18rpx 20rpx;
}
.link-edit-main {
  flex: 1;
  min-width: 0;
}
.link-edit-title {
  display: block;
  font-size: 26rpx;
  color: #333;
}
.link-edit-url {
  display: block;
  font-size: 21rpx;
  color: #aaa;
  margin-top: 4rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.link-del {
  width: 44rpx;
  height: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.link-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  height: 80rpx;
  border: 2rpx dashed #ffd08a;
  border-radius: 18rpx;
}
.link-add__text {
  font-size: 26rpx;
  color: #fea500;
  font-weight: 600;
}

/* ─── 收录的演出 ─── */
.contrib-list {
  display: flex;
  flex-direction: column;
}
.contrib {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx 0;
  border-top: 1rpx solid #f2f2f2;
}
.contrib:first-child {
  border-top: none;
}
.contrib__poster {
  width: 96rpx;
  height: 96rpx;
  border-radius: 12rpx;
  background: #f5f5f5;
  flex-shrink: 0;
}
.contrib__poster--empty {
  background: #f0f0f0;
}
.contrib__main {
  flex: 1;
  min-width: 0;
}
.contrib__title {
  display: block;
  font-size: 27rpx;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.contrib__date {
  display: block;
  font-size: 22rpx;
  color: #aaa;
  margin-top: 6rpx;
}

.empty-hint {
  padding: 20rpx 0;
}
.empty-hint__text {
  font-size: 24rpx;
  color: #aaa;
  line-height: 1.6;
}

/* ─── 状态 ─── */
.state {
  padding: 90rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
}
.state__text {
  font-size: 27rpx;
  color: #999;
}
.state__retry {
  font-size: 26rpx;
  color: #fea500;
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

/* ─── 添加链接表单 ─── */
.link-form {
  background: #fff;
  border-radius: 30rpx 30rpx 0 0;
  padding: 40rpx 36rpx calc(40rpx + env(safe-area-inset-bottom));
}
.link-form__title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #333;
  margin-bottom: 24rpx;
}
.link-form__row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 0;
  border-bottom: 1rpx solid #f2f2f2;
}
.link-form__row--block {
  flex-direction: column;
  align-items: stretch;
  gap: 12rpx;
}
.link-form__label {
  font-size: 27rpx;
  color: #333;
  width: 90rpx;
  flex-shrink: 0;
}
.link-form__value {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12rpx;
  font-size: 26rpx;
  color: #333;
}
.link-form__input {
  flex: 1;
  font-size: 26rpx;
  color: #333;
}
.link-form__hint {
  font-size: 21rpx;
  color: #aaa;
}
.link-form__error {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #f36c6c;
}
.link-form__btn {
  margin-top: 32rpx;
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
.link-form__btn::after {
  border: none;
}
.ph {
  color: #bbb;
  font-size: 26rpx;
}
</style>

<style>
/* 弹窗层级高于底部固定 CTA（z-index: 10）*/
.link-popup {
  z-index: 9999 !important;
}
</style>
