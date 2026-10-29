<template>
  <PageLayout>
    <view class="page">
      <view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
        <text class="title">用户管理</text>
      </view>

      <view class="toolbar">
        <input v-model="keyword" class="search" placeholder="搜索用户 ID / 昵称" @confirm="load" />
        <picker mode="selector" :range="statusOptions" @change="onStatusChange">
          <view class="filter">
            <text>{{ currentStatusLabel }}</text>
            <text class="arrow">▼</text>
          </view>
        </picker>
      </view>

      <scroll-view scroll-y class="list">
        <view v-for="u in users" :key="u.id" class="user-card">
          <!-- lazy-load：管理端用户列表每页 N 个头像，加载后随滚动陆续加载 -->
          <image class="avatar" :src="getUserAvatarSrc(u)" lazy-load />
          <view class="info">
            <text class="nick">{{ u.nickname || '(未设置)' }}</text>
            <text class="meta">ID: {{ u.id }} · {{ statusLabel(u.status) }}</text>
          </view>
          <view class="actions">
            <view v-if="u.status === 1" class="btn danger" @click="onDisable(u)">封号</view>
            <view v-else class="btn primary" @click="onEnable(u)">解冻</view>
          </view>
        </view>
        <view v-if="!users.length" class="empty">暂无数据</view>
      </scroll-view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import PageLayout from '@/components/PageLayout/index.vue'
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { ADMIN_ENABLED } from '@/utils/env'
import { adminRequest, redirectToAdminLogin } from '@/utils/adminToken'
import { getUserAvatarSrc } from '@/utils/avatar'

const statusBarHeight = ref(20)
statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 20

const keyword = ref('')
const statusFilter = ref('')
const users = ref<any[]>([])

/**
 * 状态筛选下拉。
 *
 * ⚠️ 已知的接口契约错配（待修，未在本轮改动行为）：
 * 1. 这里请求的是 `/admin/users`，后端该路由是**后台管理员账号**（admin_member）的
 *    CRUD 列表（见后端 cmd/server/main.go 的 adminUsers 组），返回字段里没有
 *    nickname / avatar_url；C 端用户的只读列表在 `/admin/c-users`。
 * 2. 后端 `/admin/users` 系的 `status` 是 **int**（C 端口径 1=active 2=disabled
 *    3=locked 4=pending_delete，0=不过滤），这里传的是字符串，
 *    Go 侧 `strconv.Atoi` 解析失败会退回 0 → 该筛选当前不生效。
 * 3. 「待注销」已几乎无数据：注销链路已改成立即 HardDelete
 *    （后端 service/user.go 的 Cancel），账号行 status 直接置 disabled；
 *    pending_delete 只剩旧版本遗留的 7 天后悔期数据。
 *
 * 生产构建里本页面被 vite.config.ts 的 checkAdminGate() 强制关闭（入口不出现），
 * 因此不阻塞 C 端发版；改用 `/admin/c-users` 重写时注意它**只读**，
 * 封禁/解冻没有对应接口。
 */
const statusOptions = ['全部', '正常', '封禁', '锁定', '待注销']
const statusValues = ['', 'active', 'disabled', 'locked', 'pending_delete']
const currentStatusLabel = ref('全部')

onLoad(() => {
  // 开关关闭（生产包恒为 false）或后台未登录时，直接退回登录页，
  // 避免页面停在空壳状态。
  if (!ADMIN_ENABLED) {
    redirectToAdminLogin()
    return
  }
  load()
})

function onStatusChange(e: any) {
  const idx = e.detail.value
  statusFilter.value = statusValues[idx]
  currentStatusLabel.value = statusOptions[idx]
  load()
}

function statusLabel(s: number) {
  return ['', '正常', '封禁', '锁定', '待注销'][s] || '未知'
}

async function load() {
  const p = new URLSearchParams()
  p.set('page', '1')
  p.set('page_size', '50')
  if (keyword.value) p.set('keyword', keyword.value)
  if (statusFilter.value) p.set('status', statusFilter.value)
  try {
    const r: any = await adminRequest<any>('/admin/users?' + p.toString())
    users.value = r.list || []
  } catch (e) {
    users.value = []
  }
}

async function onDisable(u: any) {
  const ok = await new Promise<boolean>((r) => {
    uni.showModal({
      title: '封号',
      content: `确认封禁「${u.nickname || u.id}」？`,
      success: (x) => r(x.confirm),
    })
  })
  if (!ok) return
  try {
    await adminRequest<any>(`/admin/users/${u.id}/disable`, { method: 'POST' })
    uni.showToast({ title: '已封号', icon: 'success' })
  } catch (e) {
    // toast 已在 adminRequest 内联提示
  }
  load()
}

async function onEnable(u: any) {
  try {
    await adminRequest<any>(`/admin/users/${u.id}/enable`, { method: 'POST' })
    uni.showToast({ title: '已解冻', icon: 'success' })
  } catch (e) {
    // toast 已在 adminRequest 内联提示
  }
  load()
}
</script>

<style scoped>
.page { min-height: 100vh; display: flex; flex-direction: column; }
.header { padding: 18rpx 30rpx; background: #fff; }
.title { font-size: 32rpx; font-weight: 600; }
.toolbar { display: flex; gap: 20rpx; padding: 20rpx 30rpx; background: #fff; border-bottom: 1rpx solid #eee; }
.search { flex: 1; background: #f5f5f5; border-radius: 30rpx; padding: 12rpx 24rpx; font-size: 26rpx; }
.filter { background: #f5f5f5; border-radius: 30rpx; padding: 12rpx 24rpx; font-size: 26rpx; }
.arrow { font-size: 20rpx; margin-left: 8rpx; }
.list { flex: 1; padding: 20rpx; }
.user-card {
  display: flex; align-items: center; padding: 24rpx;
  background: #fff; border-radius: 16rpx; margin-bottom: 20rpx;
  gap: 24rpx;
}
.avatar { width: 80rpx; height: 80rpx; border-radius: 50%; }
.info { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.nick { font-size: 28rpx; font-weight: 600; }
.meta { font-size: 22rpx; color: #999; }
.actions { display: flex; gap: 16rpx; }
.btn { padding: 12rpx 24rpx; border-radius: 30rpx; font-size: 24rpx; }
.btn.danger { background: #ff4d4f; color: #fff; }
.btn.primary { background: #fea500; color: #fff; }
.empty { text-align: center; padding: 60rpx 0; color: #999; }
</style>
