<template>
  <PageLayout>
    <view class="page">
      <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
        <uni-icons type="left" size="large" color="#333" @click="goBack" />
        <text class="nav-title">通用设置</text>
      </view>

      <!--
        顺序说明
        ────────
        账号管理 → 推送设置 → 隐私政策 → 用户协议 → 类型使用说明 → 关于我们 → 语言切换

        协议排在**前四位**：合规要求用户能随时找到并阅读现行协议。
        之前它们在个人中心一级菜单，现在下沉到本页 —— 如果再排到末尾，
        就变成"点两下才看得见"的死角。
        右侧直接显示当前生效版本号，让用户一眼确认自己读的是哪一版。
      -->
      <view class="list">
        <view class="item" @click="goAccount">
          <text class="item-label">账号管理</text>
          <view class="item-right">
            <uni-icons type="right" size="8" color="#999" />
          </view>
        </view>

        <!-- 推送设置：通知授权与订阅提醒的开关。
             原先在个人中心一级菜单，现随其它设置项一起下沉到本页。 -->
        <view class="item" @click="goNotifications">
          <text class="item-label">推送设置</text>
          <view class="item-right">
            <uni-icons type="right" size="8" color="#999" />
          </view>
        </view>

        <view class="item" @click="goAgreement('privacy_policy')">
          <text class="item-label">隐私政策</text>
          <view class="item-right">
            <text class="item-value">{{ privacyVersion }}</text>
            <uni-icons type="right" size="8" color="#999" />
          </view>
        </view>

        <view class="item" @click="goAgreement('user_agreement')">
          <text class="item-label">用户协议</text>
          <view class="item-right">
            <text class="item-value">{{ agreementVersion }}</text>
            <uni-icons type="right" size="8" color="#999" />
          </view>
        </view>

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
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { getEffectiveVersion } from '@/utils/agreementContent'

const userStore = useUserStore()

// 模板返回按钮：不能在模板里写 uni.navigateBack()，Vue 会把它解析成组件实例属性
function goBack() { uni.navigateBack(); }
const statusBarHeight = ref(20)
onMounted(() => { statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 20 })
function nav(url: string) { uni.navigateTo({ url }) }

// 协议版本取**当前生效版本**（服务端版本比包内新时以服务端为准），
// 不用包内常量 —— 否则 App 已经拉到新政策，这里还显示旧版本号。
const privacyVersion = ref(getEffectiveVersion('privacy_policy'));
const agreementVersion = ref(getEffectiveVersion('user_agreement'));

onShow(() => {
  privacyVersion.value = getEffectiveVersion('privacy_policy');
  agreementVersion.value = getEffectiveVersion('user_agreement');
});

/**
 * 账号管理需要登录。
 *
 * 与个人中心一级菜单的入口保持同一套登录门槛逻辑：
 * 未登录时弹登录框，登录成功后自动跳转到账号管理页
 * （reason 用 profile_menu，与个人中心其他受限入口一致）。
 */
function goAccount() {
  userStore.requireLogin({
    dismissible: true,
    reason: 'profile_menu',
    onSuccess: () => nav('/pages/profile/account'),
  });
}

/** 推送设置同样带登录门槛（改的是用户自己的订阅与通知偏好） */
function goNotifications() {
  userStore.requireLogin({
    dismissible: true,
    reason: 'profile_menu',
    onSuccess: () => nav('/pages/profile/notifications'),
  });
}

function goAgreement(type: 'privacy_policy' | 'user_agreement') {
  nav(`/pages/agreement/detail?type=${type}`);
}
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
