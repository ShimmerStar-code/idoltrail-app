<template>
  <PageLayout>
  <view class="page">
    <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <uni-icons type="left" size="large" color="#333" @click="goBack" />
      <text class="nav-title">账号管理</text>
    </view>

    <view class="list">
      <!-- 手机号卡 -->
      <view class="card">
        <view class="card-row">
          <view class="card-left">
            <uni-icons type="phone" size="20" color="#FEA500" />
            <text class="card-label">手机号</text>
          </view>
          <!-- 已绑定：脱敏展示 + 更换按钮 -->
          <view v-if="phone" class="card-right">
            <text class="card-value">{{ maskedPhone }}</text>
            <view class="unbind-btn" @click="changePhone">更换</view>
          </view>
          <!-- 未绑定（历史数据兜底）：引导重新登录补齐 -->
          <view v-else class="btn-wrap">
            <view class="bind-btn" @click="changePhone">去登录</view>
          </view>
        </view>
        <text class="card-sub">
          手机号即登录凭证，App 端通过短信验证码登录；如需更换，请退出后用新手机号登录。
        </text>
      </view>

      <!-- 账号卡 -->
      <view class="card">
        <view class="card-row">
          <view class="card-left">
            <uni-icons type="person" size="20" color="#FEA500" />
            <text class="card-label">{{ accountLabel }}</text>
          </view>
          <view class="switch-btn" @click="switchAccount">
            <text class="switch-text">更换账号</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 危险操作区:退出登录 + 注销账号 分层 -->
    <view class="danger-zone">
      <view class="zone-card zone-card--logout" @click="handleLogout">
        <text class="zone-text zone-text--logout">退出登录</text>
      </view>
      <view class="zone-card zone-card--cancel" @click="cancelAccount">
        <text class="zone-text zone-text--cancel">注销账号</text>
      </view>
      <text class="zone-hint">注销后账号数据将立即永久清除，无法找回。重新使用手机号注册即可创建新账号。</text>
    </view>
  </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

// 模板返回按钮：不能在模板里写 uni.navigateBack()，Vue 会把它解析成组件实例属性
function goBack() { uni.navigateBack(); }
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { userApi } from '@/api/user'
import { getNavBarMetrics } from '@/utils/system'
import PageLayout from '@/components/PageLayout/index.vue'
const userStore = useUserStore()
const statusBarHeight = ref(20)
const user = computed(() => userStore.user)
const phone = computed(() => user.value?.phone || '')

const accountLabel = computed(() => {
  const u = user.value
  if (!u) return '未登录用户'
  return u.nickname || u.phone || '当前账号'
})

// 手机号脱敏：138****5678
const maskedPhone = computed(() => {
  const p = phone.value
  if (!p || p.length < 7) return p
  return p.slice(0, 3) + '****' + p.slice(-4)
})

onLoad(() => {
  if (!userStore.isLoggedIn) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 600)
  }
})

onMounted(() => { statusBarHeight.value = getNavBarMetrics().statusBarHeight })

// ── 更换手机号：App 端无微信授权能力，走「退出后用新手机号登录」 ──
function changePhone() {
  uni.showModal({
    title: '更换手机号',
    content: '更换手机号需要退出当前账号后，用新手机号重新登录（订阅与收藏数据会随账号保留）。确定要退出吗？',
    confirmText: '退出并登录',
    cancelText: '取消',
    confirmColor: '#3B82F6',
    success: async (r) => {
      if (!r.confirm) return
      try { await userStore.logout() } catch { /* ignore */ }
      userStore.clear?.()
      uni.reLaunch({ url: '/pages/home/index' })
      setTimeout(() => {
        userStore.requireLogin({ dismissible: true, reason: 'change_phone' })
      }, 400)
    },
  })
}

// ── 更换账号 ──
async function switchAccount() {
  try { await userStore.logout() } catch { /* ignore */ }
  userStore.requireLogin({ dismissible: true, reason: 'switch_account' })
}

// ── 退出登录（只清登录态,不注销账号） ──
async function handleLogout() {
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '退出登录',
      content: '退出后需要重新用手机号验证码登录。你的账号数据不会被删除。',
      confirmText: '退出',
      cancelText: '取消',
      confirmColor: '#3B82F6',
      success: (r) => resolve(r.confirm),
    })
  })
  if (!confirmed) return
  try {
    await userStore.logout()
    uni.reLaunch({ url: '/pages/home/index' })
  } catch {
    // 即便后端失败也清理本地登录态,确保用户能重新登录
    userStore.clear?.()
    uni.reLaunch({ url: '/pages/home/index' })
  }
}

// ── 注销账号（立即彻底删除,无 7 天后悔期） ──
async function cancelAccount() {
  const warned = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '注销账号',
      content: '注销后账号数据将立即、永久清除，无法找回。重新使用手机号注册即可创建新账号。',
      confirmText: '继续',
      cancelText: '我再想想',
      confirmColor: '#F36C6C',
      success: (r) => resolve(r.confirm),
    })
  })
  if (!warned) return

  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '请确认',
      content: '此操作不可逆！账号及所有订阅、收藏数据将被永久删除。',
      confirmText: '确认注销',
      cancelText: '取消',
      confirmColor: '#F36C6C',
      success: (r) => resolve(r.confirm),
    })
  })
  if (!confirmed) return

  uni.showLoading({ title: '处理中...' })
  try {
    await userApi.cancel()
    try { await userStore.logout() } catch { /* ignore */ }
    uni.hideLoading()
    uni.showToast({ title: '账号已注销', icon: 'success' })
    setTimeout(() => uni.reLaunch({ url: '/pages/home/index' }), 1200)
  } catch (e: any) {
    uni.hideLoading()
    uni.showToast({ title: e?.message || '注销失败，请稍后再试', icon: 'none' })
  }
}
</script>

<style scoped>
.page { background: #f5f5f5; min-height: 100vh; }

.nav {
  background: #fff;
  display: flex; align-items: center; gap: 20rpx;
  padding: 18rpx 30rpx 20rpx;
  border-bottom: 1rpx solid rgba(236,236,236,1);
}
.nav-title { font-size: 34rpx; font-weight: 600; color: #333; }

.list { padding: 24rpx 24rpx 0; display: flex; flex-direction: column; gap: 16rpx; }

.card {
  background: #fff;
  border-radius: 24rpx;
  border: 1rpx solid rgba(236,236,236,1);
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04);
  padding: 28rpx 30rpx;
}
.card-row {
  display: flex; align-items: center; justify-content: space-between;
}
.card-left {
  display: flex; align-items: center; gap: 16rpx;
}
.card-label { font-size: 28rpx; font-weight: 600; color: #333; }
.card-sub { display: block; font-size: 22rpx; color: #999; margin-top: 6rpx; }
.card-right { display: flex; align-items: center; gap: 20rpx; }
.card-value { font-size: 26rpx; color: #666; }

/* 解绑按钮（普通 view，红色风格） */
.unbind-btn {
  font-size: 24rpx;
  font-weight: 600;
  color: #F36C6C;
  background: rgba(243,108,108,0.08);
  border-radius: 16rpx;
  padding: 8rpx 24rpx;
}

/* 未绑定时「点击绑定」按钮的 wrapper，防撑满宽度 */
.btn-wrap {
  display: flex;
  flex-shrink: 0;
}
.bind-btn {
  background: #FEA500;
  color: #fff;
  font-size: 26rpx;
  font-weight: 600;
  border-radius: 20rpx;
  padding: 0 32rpx;
  border: none;
  line-height: 64rpx;
  height: 64rpx;
  margin: 0;
  display: inline-block;
}
.bind-btn::after { border: none; }

.switch-btn {
  background: rgba(254,165,0,1); border-radius: 20rpx;
  padding: 12rpx 28rpx;
}
.switch-text { font-size: 26rpx; font-weight: 600; color: #fff; }

/* ── 危险操作区：分层卡片 ── */
.danger-zone {
  padding: 40rpx 30rpx calc(60rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.zone-card {
  background: #fff;
  border-radius: 50rpx;
  padding: 30rpx 0;
  text-align: center;
  border: 1rpx solid rgba(236,236,236,1);
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04);
}
.zone-card--logout {
  background: #fff;
}
.zone-card--cancel {
  background: rgba(243,108,108,0.04);
  border-color: rgba(243,108,108,0.2);
}
.zone-text { font-size: 30rpx; font-weight: 600; }
.zone-text--logout { color: #3B82F6; }     /* 蓝色：轻度操作 */
.zone-text--cancel { color: #F36C6C; }     /* 红色：高危操作 */
.zone-hint {
  display: block;
  font-size: 22rpx;
  color: #999;
  text-align: center;
  margin-top: 8rpx;
  line-height: 1.5;
  padding: 0 20rpx;
}
</style>
