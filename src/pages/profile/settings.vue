<template>
  <PageLayout>
    <view class="page">
      <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
        <uni-icons type="left" size="large" color="#333" @click="goBack" />
        <text class="nav-title">通用</text>
      </view>

      <view class="list">
        <view class="item" @click="nav('/pages/profile/type-guide')">
          <text class="item-label">类型使用说明</text>
          <uni-icons type="right" size="8" color="#999" />
        </view>
        <view class="item" @click="nav('/pages/profile/about')">
          <text class="item-label">关于我们</text>
          <uni-icons type="right" size="8" color="#999" />
        </view>
        <view class="item">
          <text class="item-label">语言切换</text>
          <view class="item-right">
            <text class="item-value">中文</text>
            <uni-icons type="right" size="8" color="#999" />
          </view>
        </view>
      </view>

      <!-- 注销账号入口已统一迁移到 "账号管理"(pages/profile/account.vue),此处不再重复 -->
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import PageLayout from '@/components/PageLayout/index.vue'
import { ref, onMounted } from 'vue'

// 模板返回按钮：不能在模板里写 uni.navigateBack()，Vue 会把它解析成组件实例属性
function goBack() { uni.navigateBack(); }
const statusBarHeight = ref(20)
onMounted(() => { statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 20 })
function nav(url: string) { uni.navigateTo({ url }) }
</script>

<style scoped>
.page { background: #fff; min-height: 100vh; }
.nav {
  display: flex; align-items: center; gap: 20rpx;
  padding: 18rpx 30rpx 20rpx;
  border-bottom: 1rpx solid rgba(236,236,236,1);
}
.nav-title { font-size: 34rpx; font-weight: 600; color: rgba(51,51,51,1); }
.list { padding: 30rpx; display: flex; flex-direction: column; gap: 20rpx; }
.item {
  background: #fff; border-radius: 30rpx;
  border: 1rpx solid rgba(236,236,236,1);
  box-shadow: 0 10rpx 30rpx rgba(0,0,0,0.05);
  padding: 26rpx 30rpx;
  display: flex; align-items: center; justify-content: space-between;
}
.item-label { font-size: 26rpx; font-weight: 600; color: rgba(51,51,51,1); }
.item-right { display: flex; align-items: center; gap: 16rpx; }
.item-value { font-size: 26rpx; color: rgba(153,153,153,1); }
</style>
