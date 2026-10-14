<template>
  <PageLayout>
    <view class="page">
      <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
        <uni-icons type="left" size="large" color="#333" @click="goBack" />
        <text class="nav-title">类型使用说明</text>
      </view>
      <scroll-view scroll-y class="scroll-body">
        <view class="list">
          <view class="card" v-for="t in types" :key="t.name">
            <text class="card-title">{{ t.name }}</text>
            <text class="card-desc">{{ t.desc }}</text>
          </view>
        </view>
      </scroll-view>
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
const types = [
  { name: '演唱会', desc: '以歌手或乐队为核心的现场音乐表演活动，通常在大型体育场馆或演唱会场地举办，观众以听歌为主要目的。' },
  { name: '音乐节', desc: '多个艺术家或乐队在同一场地分时段演出的大型户外或室内活动，通常持续数天，氛围轻松自由。' },
  { name: '粉丝见面会', desc: '偶像与粉丝近距离互动的活动，通常包括签名、合影、问答等环节，规模较小，互动性强。' },
  { name: '线上活动', desc: '通过网络直播平台进行的虚拟演出或互动活动，粉丝无需到场即可参与。' },
  { name: '漫展', desc: '以动漫、游戏、二次元文化为主题的展览活动，通常包括coser展示、声优嘉宾、周边售卖等内容。' },
  { name: '音乐会', desc: '以古典音乐或交响乐为主的正式演出，通常在音乐厅举办，观众需保持安静欣赏。' },
]
</script>

<style scoped>
.page { background: #fff; min-height: 100vh; }
.nav {
  display: flex; align-items: center; gap: 20rpx;
  padding: 18rpx 30rpx 20rpx;
  border-bottom: 1rpx solid rgba(236,236,236,1);
}
.nav-title { font-size: 34rpx; font-weight: 600; color: rgba(51,51,51,1); }
.scroll-body { flex: 1; }
.list { padding: 30rpx; display: flex; flex-direction: column; gap: 20rpx; }
.card {
  background: #fff; border-radius: 30rpx;
  border: 1rpx solid rgba(236,236,236,1);
  box-shadow: 0 10rpx 30rpx rgba(0,0,0,0.05);
  padding: 26rpx 30rpx;
}
.card-title { font-size: 26rpx; font-weight: 600; color: rgba(51,51,51,1); display: block; margin-bottom: 16rpx; }
.card-desc { font-size: 26rpx; color: rgba(153,153,153,1); line-height: 1.8; }
</style>
