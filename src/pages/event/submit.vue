<!--
  pages/event/submit  上传情报（用户众包上报演出线索）
  ─────────────────────────────────────────────
  入口:  个人中心「上传情报」pages/profile/index.vue

  布局（自上而下）:
    1. 自定义导航(返回 + 「上传情报」)
    2. 引导语: 为什么要上报、通过后会发生什么
    3. 海报图区(最多 3 张, 本地预览, 提交时才上传)
    4. 活动名称(选填)
    5. 补充说明(必填, 500 字上限)
    6. 我的上报(只读列表, 展示审核状态)
    7. 底部固定「提交情报」按钮

  刻意不做结构化录入(艺人/城市/场馆/时间):
    截图本身承载了大部分信息, 运营看图辨认的成本远低于让用户逐项填表,
    而填表会大幅抬高放弃率。这个功能省的是运营时间, 不能再拿用户时间去换。

  注意:
    - textarea 禁止 box-sizing: border-box(H5 端会导致无法聚焦输入)
    - 选图只更新本地预览, 点「提交」才真正上传(照 profile/edit.vue 的 pendingFilePath 模式)
-->
<template>
  <PageLayout>
    <view class="page">
      <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
        <uni-icons type="left" size="large" color="#333" @click="goBack" />
        <text class="nav-title">上传情报</text>
        <view class="nav-placeholder" />
      </view>

      <scroll-view scroll-y class="scroll-body">
        <!-- 引导语 -->
        <view class="intro">
          <text class="intro-title">看到 App 里还没有的演出？</text>
          <text class="intro-text"
            >拍下海报或演出信息发给我们。运营核实后会把它加进 App，被采用还能拿到星币。</text
          >
        </view>

        <!-- 海报图 -->
        <view class="card">
          <view class="card-head">
            <text class="card-title">海报图片</text>
            <text class="card-tip">{{ pending.length }}/{{ MAX_IMAGES }}</text>
          </view>

          <view class="img-grid">
            <view v-for="(p, i) in pending" :key="p" class="img-item">
              <image class="img-preview" :src="p" mode="aspectFill" />
              <view class="img-del" @click="removeImage(i)">
                <text class="img-del__x">×</text>
              </view>
            </view>

            <view v-if="pending.length < MAX_IMAGES" class="img-add" @click="pickImage">
              <uni-icons type="camera" size="28" color="#bbb" />
              <text class="img-add__text">添加</text>
            </view>
          </view>

          <text v-if="errorMsg" class="field-error">{{ errorMsg }}</text>
        </view>

        <!-- 活动名称（选填） -->
        <view class="card">
          <view class="card-head">
            <text class="card-title">活动名称</text>
            <text class="card-tip">选填</text>
          </view>
          <input
            v-model="form.title"
            class="field-input"
            placeholder="例如：周杰伦 嘉年华 世界巡回演唱会"
            placeholder-class="field-ph"
            :maxlength="60"
          />
        </view>

        <!-- 补充说明（必填） -->
        <view class="card">
          <view class="card-head">
            <text class="card-title">补充说明</text>
            <text class="card-tip">{{ form.content.length }}/{{ MAX_CONTENT }}</text>
          </view>
          <textarea
            v-model="form.content"
            class="field-textarea"
            placeholder="演出时间、城市、场馆…&#10;请附上情报来源链接（微博 / 大麦 / 公众号 / 官微），方便我们快速核实"
            placeholder-class="field-ph"
            :maxlength="MAX_CONTENT"
            :disable-default-padding="true"
          />
          <text v-if="errorMsg" class="field-error">{{ errorMsg }}</text>
        </view>

        <!-- 我的上报 -->
        <view class="card">
          <view class="card-head">
            <text class="card-title">我的上报</text>
            <text class="card-tip" @click="loadMine">{{ mineLoading ? '加载中' : '刷新' }}</text>
          </view>

          <view v-if="mineLoading" class="state">加载中...</view>
          <view v-else-if="!mine.length" class="state">还没有上报过</view>
          <view v-for="s in mine" :key="s.id" class="mine-item">
            <view class="mine-left">
              <image
                v-if="s.images.length"
                class="mine-thumb"
                :src="s.images[0]"
                mode="aspectFill"
              />
              <view class="mine-info">
                <text class="mine-title">{{ s.title || '（未填标题）' }}</text>
                <text class="mine-date">{{ formatDate(s.created_at) }}</text>
              </view>
            </view>
            <view class="mine-right">
              <text class="mine-status" :class="'mine-status--' + s.status.toLowerCase()">
                {{ statusLabel(s.status) }}
              </text>
              <text v-if="s.review_note" class="mine-note">{{ s.review_note }}</text>
            </view>
          </view>
        </view>

        <view class="bottom-spacer" />
      </scroll-view>

      <!-- 底部提交栏 -->
      <view class="submit-bar">
        <button class="submit-btn" :class="{ 'submit-btn--off': !canSubmit }" :disabled="!canSubmit" @click="submit">
          {{ submitting ? '提交中...' : '提交情报' }}
        </button>
      </view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { onUnload } from '@dcloudio/uni-app'
import PageLayout from '@/components/PageLayout/index.vue'
import { submissionApi } from '@/api/submission'
import { useUserStore } from '@/stores/user'
import { getNavBarMetrics } from '@/utils/system'
import type { Submission } from '@/types/submission'

const MAX_IMAGES = 3
const MAX_CONTENT = 500

const userStore = useUserStore()
const { statusBarHeight } = getNavBarMetrics()

const pending = ref<string[]>([]) // 本地临时路径，提交时才上传
const submitting = ref(false)
const errorMsg = ref('')
const mine = ref<Submission[]>([])
const mineLoading = ref(false)

const form = reactive({ title: '', content: '' })

// 图至少传一张：纯文字没有可核实的信息，运营无从查证
const canSubmit = computed(
  () => pending.value.length > 0 && form.content.trim().length > 0 && !submitting.value,
)

function goBack() {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.switchTab({ url: '/pages/profile/index' })
}

/** 提交成功后延迟刷新「我的上报」的定时器句柄（离页必须清掉） */
let refreshMineTimer: ReturnType<typeof setTimeout> | null = null

onUnload(() => {
  if (refreshMineTimer) {
    clearTimeout(refreshMineTimer)
    refreshMineTimer = null
  }
})

function pickImage() {
  const remain = MAX_IMAGES - pending.value.length
  if (remain <= 0) return
  uni.chooseImage({
    count: remain,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success(res) {
      // 只存本地路径做预览，不立即上传
      pending.value = pending.value.concat(res.tempFilePaths).slice(0, MAX_IMAGES)
    },
  })
}

function removeImage(i: number) {
  pending.value.splice(i, 1)
}

function statusLabel(s: string) {
  return s === 'PENDING' ? '待核实' : s === 'CONVERTED' ? '已收录' : '未采用'
}

function formatDate(v: string) {
  return v ? String(v).slice(0, 10) : ''
}

async function loadMine() {
  if (mineLoading.value) return
  mineLoading.value = true
  try {
    const r = await submissionApi.mine()
    mine.value = r?.list || []
  } catch (e) {
    // 列表失败不打扰用户：提交才是本页的主任务
  } finally {
    mineLoading.value = false
  }
}

async function submit() {
  if (!canSubmit.value) return
  errorMsg.value = ''
  submitting.value = true
  try {
    // 先把图片全部传上去拿 URL，再一次性提交上报
    // 并发上传：串行 await 是 N 张图 N 个 RTT 叠加，弱网下每张 ~1s 就拖成十几秒
    const urls: string[] = await Promise.all(
      pending.value.map((p) => submissionApi.uploadImage(p)),
    )
    await submissionApi.create({
      title: form.title.trim(),
      content: form.content.trim(),
      images: urls,
    })

    uni.showToast({ title: '已提交，等待核实', icon: 'success' })
    // 清空表单，避免重复提交同一条
    pending.value = []
    form.title = ''
    form.content = ''
    // 800ms 只是为了让 toast 先播完再发请求。这段延迟的回调若落在
    // 「提交成功 → 用户立刻返回」的窗口里，会回调进已卸载的页面实例。
    refreshMineTimer = setTimeout(() => {
      refreshMineTimer = null
      loadMine()
    }, 800)
  } catch (e: any) {
    errorMsg.value = e?.message || '提交失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  if (userStore.isLoggedIn) loadMine()
})
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
.nav-placeholder {
  width: 40rpx;
}

.scroll-body {
  flex: 1;
  padding: 20rpx 24rpx 0;
  box-sizing: border-box;
}

/* ─── 引导语 ─── */
.intro {
  padding: 8rpx 8rpx 22rpx;
}
.intro-title {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: #333;
  margin-bottom: 10rpx;
}
.intro-text {
  display: block;
  font-size: 25rpx;
  color: #888;
  line-height: 1.7;
}

/* ─── 卡片 ─── */
.card {
  background: #fff;
  border-radius: 30rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.05);
}
.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 20rpx;
}
.card-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
}
.card-tip {
  font-size: 22rpx;
  color: #aaa;
}

/* ─── 图片区 ─── */
.img-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.img-item {
  position: relative;
  width: 180rpx;
  height: 180rpx;
}
.img-preview {
  width: 100%;
  height: 100%;
  border-radius: 16rpx;
  background: #f5f5f5;
}
.img-del {
  position: absolute;
  top: -12rpx;
  right: -12rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 20rpx;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}
.img-del__x {
  color: #fff;
  font-size: 32rpx;
  line-height: 1;
}
.img-add {
  width: 180rpx;
  height: 180rpx;
  border-radius: 16rpx;
  border: 2rpx dashed #ddd;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}
.img-add__text {
  font-size: 22rpx;
  color: #bbb;
}

/* ─── 表单 ─── */
.field-input {
  width: 100%;
  height: 88rpx;
  padding: 0 20rpx;
  background: #f7f7f7;
  border-radius: 16rpx;
  font-size: 26rpx;
  color: #333;
}
.field-textarea {
  width: 100%;
  height: 200rpx;
  padding: 20rpx;
  background: #f7f7f7;
  border-radius: 16rpx;
  font-size: 26rpx;
  color: #333;
  line-height: 1.6;
}
.field-ph {
  color: #bbb;
  font-size: 26rpx;
}
.field-error {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #f36c6c;
}

/* ─── 我的上报 ─── */
.state {
  text-align: center;
  color: #aaa;
  font-size: 26rpx;
  padding: 40rpx 0;
}
.mine-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 0;
  border-top: 1rpx solid #f2f2f2;
}
.mine-item:first-child {
  border-top: none;
}
.mine-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
  flex: 1;
  min-width: 0;
}
.mine-thumb {
  width: 72rpx;
  height: 72rpx;
  border-radius: 10rpx;
  background: #f5f5f5;
  flex-shrink: 0;
}
.mine-info {
  flex: 1;
  min-width: 0;
}
.mine-title {
  display: block;
  font-size: 26rpx;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mine-date {
  display: block;
  font-size: 22rpx;
  color: #aaa;
  margin-top: 6rpx;
}
.mine-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6rpx;
  max-width: 200rpx;
}
.mine-status {
  font-size: 22rpx;
  font-weight: 600;
}
.mine-status--pending {
  color: #fea500;
}
.mine-status--converted {
  color: #34c759;
}
.mine-status--rejected {
  color: #bbb;
}
.mine-note {
  font-size: 20rpx;
  color: #aaa;
  text-align: right;
  line-height: 1.4;
}

.bottom-spacer {
  height: 160rpx;
}

/* ─── 底部提交栏 ─── */
.submit-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -8rpx 24rpx rgba(0, 0, 0, 0.06);
}
.submit-btn {
  width: 100%;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 46rpx;
  background: linear-gradient(135deg, #fea500 0%, #ffd200 100%);
  color: #fff;
  font-size: 32rpx;
  font-weight: 700;
  border: none;
}
.submit-btn::after {
  border: none;
}
.submit-btn--off {
  background: #ddd;
}
</style>
