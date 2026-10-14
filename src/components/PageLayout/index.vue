<template>
  <view class="page-layout">
    <!-- 业务内容 -->
    <slot />
    <!-- 全局浮层:放在 slot 之后、tab 栏之上,覆盖全屏 -->
    <DisclaimerPopup />
    <LoginModal />
    <PrivacyPopup />
    <NotificationPromptModal />
  </view>
</template>

<script setup lang="ts">
import DisclaimerPopup from '@/components/DisclaimerPopup/index.vue'
import LoginModal from '@/components/LoginModal/index.vue'
import PrivacyPopup from '@/components/PrivacyPopup/index.vue'
import NotificationPromptModal from '@/components/NotificationPromptModal/index.vue'
</script>

<style scoped>
/*
 * 注意:不要再在 .page-layout 上加 background / min-height 之类的样式,
 * 业务页面的 .page 自己管背景。PageLayout 只负责把全局 modal 挂到任何被它包住的页面里。
 *
 * 之所以有这个组件,是因为 App / 小程序的页面栈不会渲染 App.vue 的 template,
 * 写在 App.vue template 里的全局组件不会实例化,LoginModal 的 watch / onMounted 永远不跑,
 * modal 永远弹不出来。每个页面显式用 PageLayout 包裹一次,等价于把组件"挂到页面上"。
 *
 * 注意：App 端每个页面各自持有一份实例，App.vue 里不要重复挂载，避免双弹窗。
 */
</style>
