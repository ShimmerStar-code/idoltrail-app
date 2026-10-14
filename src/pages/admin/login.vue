<template>
  <PageLayout>
    <view v-if="!ADMIN_ENABLED" class="page">
      <view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
        <text class="title">管理后台登录</text>
      </view>
      <view class="form">
        <view class="locked">
          <text class="locked__text">当前构建未开启管理后台入口。</text>
          <text class="locked__hint">
            管理后台不随 C 端发布包分发。如需调试，请在 .env 中设置 VITE_ADMIN_ENABLED=true，
            并使用 dev 或真机自定义基座（npm run build:app 会在构建期强制关闭该开关）。
          </text>
        </view>
        <view class="login-btn disabled" @click="toHome">
          <text class="btn-text">返回首页</text>
        </view>
      </view>
    </view>

    <view v-else class="page">
      <view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
        <text class="title">管理后台登录</text>
      </view>
      <view class="form">
        <view v-if="error" class="error">{{ error }}</view>
        <view class="form-row">
          <text class="label">账号</text>
          <input v-model="username" class="input" placeholder="admin" />
        </view>
        <view class="form-row">
          <text class="label">密码</text>
          <input v-model="password" class="input" password type="password" placeholder="••••••" />
        </view>
        <view class="login-btn" :class="{ disabled: loading || !username || !password }" @click="onLogin">
          <text class="btn-text">{{ loading ? '登录中...' : '登录' }}</text>
        </view>
      </view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import PageLayout from '@/components/PageLayout/index.vue'
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { API_BASE_URL, ADMIN_ENABLED } from '@/utils/env'
import { setAdminTokens } from '@/utils/adminToken'

const statusBarHeight = ref(20)
const username = ref('')
const password = ref('')
const loading = ref(false)
// 内联展示错误：登录失败是高频路径，toast 一闪而过不便于排查
const error = ref('')

statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 20

onLoad(() => {
  if (!ADMIN_ENABLED) toHome()
})

function toHome() {
  uni.switchTab({ url: '/pages/home/index' })
}

async function onLogin() {
  if (!username.value || !password.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    // admin 走裸 uni.request，不经过 request.ts：
    // 后台的 401 不该触发 C 端用户的 refresh 链，更不该复用用户 token。
    const resp = await new Promise<{ code: number; message: string; data: any }>(
      (resolve, reject) => {
        uni.request({
          url: API_BASE_URL + '/admin/login',
          method: 'POST',
          data: { username: username.value, password: password.value },
          timeout: 15000,
          success: (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data as any)
            else reject(new Error(`HTTP ${res.statusCode}`))
          },
          fail: (err) => reject(new Error(err.errMsg || '网络请求失败')),
        })
      }
    )
    if (resp.code !== 0 || !resp.data?.access_token) {
      error.value = resp.message || '登录失败'
      return
    }
    setAdminTokens(resp.data.access_token, resp.data.refresh_token || '')
    uni.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(() => {
      uni.reLaunch({ url: '/pages/admin/users' })
    }, 600)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.page { background: #fff; min-height: 100vh; }
.header { padding: 18rpx 30rpx 20rpx; }
.title { font-size: 34rpx; font-weight: 600; color: #333; }
.form { padding: 40rpx 30rpx; }
.form-row { display: flex; align-items: center; padding: 24rpx 0; border-bottom: 1rpx solid #eee; }
.label { font-size: 28rpx; color: #333; width: 100rpx; }
.input { flex: 1; font-size: 28rpx; }
.error { margin-bottom: 16rpx; font-size: 26rpx; color: #e64340; }
.locked { padding: 30rpx 0 10rpx; }
.locked__text { display: block; font-size: 30rpx; color: #333; font-weight: 600; }
.locked__hint { display: block; margin-top: 14rpx; font-size: 24rpx; color: #999; line-height: 1.7; }
.login-btn {
  margin-top: 60rpx;
  background: linear-gradient(135deg, #fea500, #ffd200);
  border-radius: 50rpx; padding: 24rpx 0; text-align: center;
}
.login-btn.disabled { opacity: 0.4; }
.btn-text { color: #fff; font-size: 30rpx; font-weight: 600; }
</style>