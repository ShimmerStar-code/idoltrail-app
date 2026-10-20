<template>
  <PageLayout>
    <view class="page">
      <view class="nav" :style="{ paddingTop: statusBarHeight + 'px', height: navHeight + 'px' }">
        <uni-icons
          type="left"
          size="large"
          color="#333"
          @click="goBack"
        />
        <text class="nav-title">个人信息修改</text>
      </view>

      <scroll-view scroll-y class="scroll-body">
        <!-- 头像 -->
        <view class="avatar-section">
          <view class="avatar-wrap" @click="pickAvatar">
            <image
              class="avatar"
              :src="avatarPreview || getUserAvatarSrc(user ?? undefined)"
              mode="aspectFill"
            />
            <view class="edit-icon">
              <uni-icons type="compose" size="14" color="#fff" />
            </view>
          </view>
        </view>

        <view class="form">
          <!-- 用户名 -->
          <view class="field-card">
            <text class="field-label">用户名：</text>
            <input
              class="field-input"
              v-model="form.nickname"
              placeholder="请输入用户名"
              placeholder-class="ph"
              maxlength="30"
            />
          </view>

          <!-- 性别 picker -->
          <picker
            :range="GENDER_LABELS"
            :value="genderIndex"
            @change="onGenderChange"
          >
            <view class="field-card">
              <text class="field-label">性别：</text>
              <view class="field-right">
                <text class="field-value">{{
                  GENDER_LABELS[genderIndex]
                }}</text>
                <uni-icons type="right" size="8" color="#999" />
              </view>
            </view>
          </picker>

          <!-- 邮箱 -->
          <view class="field-card">
            <text class="field-label">邮箱：</text>
            <input
              class="field-input"
              v-model="form.email"
              placeholder="请输入邮箱"
              placeholder-class="ph"
              maxlength="128"
            />
          </view>

          <!-- 微信 -->
          <view class="field-card">
            <text class="field-label">微信：</text>
            <input
              class="field-input"
              v-model="form.wechat_id"
              placeholder="请输入微信号"
              placeholder-class="ph"
              maxlength="64"
            />
          </view>

          <!-- 生日 date picker -->
          <picker
            mode="date"
            :value="form.birthday"
            start="1900-01-01"
            :end="today"
            @change="onBirthdayChange"
          >
            <view class="field-card">
              <text class="field-label">生日：</text>
              <view class="field-right">
                <text class="field-value" :class="{ ph: !form.birthday }">{{
                  form.birthday || "请选择"
                }}</text>
                <uni-icons type="right" size="8" color="#999" />
              </view>
            </view>
          </picker>

          <!-- 国籍 -->
          <view class="field-card">
            <text class="field-label">国籍：</text>
            <input
              class="field-input"
              v-model="form.nationality"
              placeholder="请输入国籍"
              placeholder-class="ph"
              maxlength="64"
            />
          </view>

          <!-- 其它 -->
          <view class="field-card">
            <text class="field-label">其它：</text>
            <input
              class="field-input"
              v-model="form.bio"
              placeholder="选填"
              placeholder-class="ph"
              maxlength="200"
            />
          </view>

          <!-- 手机号：只读，账号管理修改 -->
          <view
            class="field-card readonly-card"
            @click="nav('/pages/profile/account')"
          >
            <text class="field-label">手机号：</text>
            <view class="field-right">
              <text class="field-value" :class="{ ph: !user?.phone }">{{
                user?.phone || "前往账号管理绑定"
              }}</text>
              <uni-icons type="right" size="8" color="#ccc" />
            </view>
          </view>
        </view>
      </scroll-view>

      <view class="confirm-btn" :class="{ disabled: saving }" @click="save">
        <text class="confirm-text">{{ saving ? "保存中…" : "确认" }}</text>
      </view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";

// 模板返回按钮：不能在模板里写 uni.navigateBack()，Vue 会把它解析成组件实例属性
function goBack() { uni.navigateBack(); }
import { onLoad } from "@dcloudio/uni-app";
import { useUserStore } from "@/stores/user";
import { userApi } from "@/api/user";
import { getNavBarMetrics } from "@/utils/system";
import { getUserAvatarSrc } from "@/utils/avatar";
import PageLayout from "@/components/PageLayout/index.vue";
const GENDER_LABELS = ["保密", "男", "女"];

const userStore = useUserStore();
const user = computed(() => userStore.user);
const statusBarHeight = ref(20);
const navHeight = ref(64); // 状态栏 + 导航栏总高
const saving = ref(false);
const avatarPreview = ref("");
let pendingFilePath = "";

const today = new Date().toISOString().slice(0, 10);

onLoad(() => {
  if (!userStore.isLoggedIn) {
    uni.showToast({ title: "请先登录", icon: "none" });
    setTimeout(() => uni.navigateBack(), 600);
  }
});

onMounted(() => {
  const metrics = getNavBarMetrics();
  statusBarHeight.value = metrics.statusBarHeight;
  navHeight.value = metrics.statusBarHeight + metrics.navBarHeight;
});

const form = ref({
  nickname: user.value?.nickname ?? "",
  email: user.value?.email ?? "",
  wechat_id: user.value?.wechat_id ?? "",
  birthday: user.value?.birthday ?? "",
  nationality: user.value?.nationality ?? "",
  bio: user.value?.bio ?? "",
});
// 显式 ref<number>：user.gender 是 0|1|2 字面量联合，直接 ref() 会把类型推成
// 0|1|2，导致 picker @change 里 `+e.detail.value`(number) 赋不进去。
// 提交时再 cast 回 0|1|2（见 save()）。
const genderIndex = ref<number>(user.value?.gender ?? 0);

/**
 * picker 的 change 事件处理放在 script 而不是模板里：
 * 模板表达式不支持 TS 类型注解（`(e: X) => ...` 会解析失败），
 * 而不写注解又会让 e 退化成隐式 any 触发 TS7006。
 */
function onGenderChange(e: { detail: { value: string | number } }) {
  genderIndex.value = +e.detail.value;
}

function onBirthdayChange(e: { detail: { value: string } }) {
  form.value.birthday = e.detail.value;
}

function nav(url: string) {
  uni.navigateTo({ url });
}

async function pickAvatar() {
  uni.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success(res) {
      avatarPreview.value = res.tempFilePaths[0];
      pendingFilePath = res.tempFilePaths[0];
    },
  });
}

async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    // 头像上传：后端 UploadAvatar 已自动将完整 URL 写入 DB，无需再传给 updateMe
    if (pendingFilePath) {
      await userApi.uploadAvatar(pendingFilePath);
      pendingFilePath = "";
    }

    await userApi.updateMe({
      nickname: form.value.nickname.trim() || undefined,
      gender: genderIndex.value as 0 | 1 | 2,
      email: form.value.email.trim() || undefined,
      wechat_id: form.value.wechat_id.trim() || undefined,
      birthday: form.value.birthday || undefined,
      nationality: form.value.nationality.trim() || undefined,
      bio: form.value.bio.trim() || undefined,
    });

    const fresh = await userApi.me();
    userStore.setUser(fresh);

    uni.showToast({ title: "保存成功", icon: "success" });
    setTimeout(() => uni.navigateBack(), 800);
  } catch (err: any) {
    // request.ts 对 API 错误已弹 toast（含昵称重复提示）；仅兜底网络层异常
    if (err?.message && !err.message.includes("request")) {
      // API 错误 toast 已由 request.ts 处理，不重复弹
    } else {
      uni.showToast({ title: "网络错误，请重试", icon: "none" });
    }
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.nav {
  background: #fff;
  position: relative;
  display: flex;
  align-items: center;
  padding-left: 30rpx;
  padding-right: 30rpx;
  border-bottom: 1rpx solid rgba(236, 236, 236, 1);
  box-sizing: border-box;
}
.nav-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 34rpx;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
}

.scroll-body {
  flex: 1;
  padding-bottom: 160rpx;
}

.avatar-section {
  display: flex;
  justify-content: center;
  padding: 50rpx 0 40rpx;
}
.avatar-wrap {
  position: relative;
  width: 180rpx;
  height: 180rpx;
}
.avatar {
  width: 100%;
  height: 100%;
  border-radius: 90rpx;
}
.edit-icon {
  position: absolute;
  bottom: 4rpx;
  right: 4rpx;
  width: 52rpx;
  height: 52rpx;
  border-radius: 26rpx;
  background: rgba(60, 60, 60, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
}

.form {
  padding: 0 30rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.field-card {
  background: #fff;
  border-radius: 30rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.04);
  padding: 26rpx 30rpx;
  display: flex;
  align-items: center;
}
.field-label {
  font-size: 26rpx;
  color: #333;
  white-space: nowrap;
}
.field-input {
  flex: 1;
  font-size: 26rpx;
  color: #333;
  padding: 0;
  background: transparent;
}
.ph {
  color: #bbb;
}
.field-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16rpx;
}
.field-value {
  font-size: 26rpx;
  color: #333;
}

.readonly-card {
  opacity: 0.65;
}

.confirm-btn {
  position: fixed;
  bottom: 40rpx;
  left: 30rpx;
  right: 30rpx;
  background: #fea500;
  border-radius: 50rpx;
  padding: 30rpx 0;
  text-align: center;
}
.confirm-btn.disabled {
  opacity: 0.6;
}
.confirm-text {
  font-size: 30rpx;
  font-weight: 600;
  color: #fff;
}
</style>
