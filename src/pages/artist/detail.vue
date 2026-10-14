<template>
  <PageLayout>
    <page-layout>
      <view class="page" v-if="store.detail">
        <!-- 顶部导航 -->
        <view
          class="nav-bar"
          :style="{
            paddingTop: statusBarHeight + 'px',
            paddingRight: navRightPadding + 'px',
          }"
        >
          <view class="nav-back" @click="goBack">
            <uni-icons type="left" size="large" color="#333" />
            <text class="nav-title">偶像详情</text>
          </view>
          <view class="nav-right">
            <view
              class="nav-circle-btn"
              @click="onToggleSubscribe"
              hover-class="nav-circle-btn--hover"
            >
              <image
                v-if="!isSubscribed"
                class="nav-subscribe-icon"
                src="/static/icons/subscribe_icon.svg"
                mode="aspectFit"
              />
              <image
                v-else
                class="nav-subscribe-icon"
                src="/static/icons/subscribed.svg"
                mode="aspectFit"
              />
            </view>
          </view>
        </view>

        <scroll-view scroll-y class="scroll-body">
          <!-- 艺术家粉色卡片 -->
          <view class="artist-card">
            <view class="card-row">
              <view class="avatar-wrap">
                <image class="avatar" :src="avatarSrc" mode="aspectFill" @error="onAvatarError" />
              </view>
              <text class="card-name">{{ titleWithAliases }}</text>
            </view>
            <text v-if="description" class="card-desc">{{ description }}</text>

            <!-- 基本信息标签:流式排布 -->
            <view class="info-tags">
              <view v-for="t in infoTags" :key="t.key" class="info-tag">
                <image class="info-tag-icon" :src="t.icon" mode="aspectFit" />
                <text class="tag-label">{{ t.label }}</text>
              </view>
            </view>
          </view>

          <!-- 社交按钮(固定 5 个,无 URL 置灰) -->
          <view class="social-row-wrap">
            <view class="social-row">
              <view
                v-for="s in socials"
                :key="s.key"
                class="social-btn"
                @click="onSocialTap(s)"
              >
                <image class="social-icon" :src="s.icon" mode="aspectFill" />
              </view>
            </view>
          </view>

          <!-- 演出日程 -->
          <view class="section-pad">
            <view class="section-title-row">
              <text class="section-title section-title--highlight">演出日程</text>
              <text class="section-all" @click="toEventList">查看所有</text>
            </view>
            <view v-if="relatedEvents.length > 0">
              <EventCard
                v-for="ev in relatedEvents"
                :key="ev.id"
                :event="ev"
                :entryGenreCode="store.detail?.genres?.[0]?.genre_code"
                @select="toEvent"
              />
            </view>
            <view v-else class="no-event"
              ><text class="no-event-text">暂无演出安排</text></view
            >
          </view>

          <!-- 作品集 -->
          <view class="section-pad" v-if="store.detail.works?.length">
            <view class="section-title-row">
              <text class="section-title section-title--highlight">作品集</text>
            </view>
            <view class="works-card">
              <view v-for="w in store.detail.works" :key="w.id" class="work-item">
                <text class="work-title"
                  >• {{ w.title
                  }}{{
                    formatWorkDate(w.release_date)
                      ? "（" + formatWorkDate(w.release_date) + "）"
                      : ""
                  }}</text
                >
                <text v-if="w.description" class="work-desc">「{{ w.description }}」</text>
              </view>
            </view>
          </view>

          <view style="height: 80rpx" />
        </scroll-view>
      </view>
      <view v-else class="loading">加载中...</view>
    </page-layout>
  </PageLayout>
</template>

<script setup lang="ts">
import PageLayout from "@/components/PageLayout/index.vue";
import { ref, computed, onMounted } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { useArtistStore } from "@/stores/artist";
import { useSubscribeStore } from "@/stores/subscribe";
import { useUserStore } from "@/stores/user";
import { useNotificationStore } from "@/stores/notification";
import { syncPushToken } from "@/composables/usePush";
import EventCard from "@/components/EventCard/index.vue";
import { zodiacOf } from "@/utils/zodiac";
import { getArtistAvatarSrc, getDefaultAvatarSrc } from "@/utils/avatar";
import { getNavBarMetrics } from "@/utils/system";
const artistStore = useArtistStore();
const subscribeStore = useSubscribeStore();
const userStore = useUserStore();
const store = artistStore;
const statusBarHeight = ref(20);
const navRightPadding = ref(16);

onLoad((options) => {
  const id = options?.id;
  if (!id || id === "undefined") {
    uni.showToast({ title: "艺术家ID缺失", icon: "none" });
    return;
  }
  artistStore.fetchDetail(id);
  // 不再请求全量活动列表 — 关联活动由 artistApi.detail 返回的 events 字段提供
});

onMounted(() => {
  const metrics = getNavBarMetrics();
  statusBarHeight.value = metrics.statusBarHeight;
  navRightPadding.value = metrics.navRightPadding;
});

// ── 头像：优先用 avatar_url（忽略默认占位 URL），加载失败时降级为 type/gender 默认头像 ──
const avatarLoadFailed = ref(false)
const avatarSrc = computed(() =>
  avatarLoadFailed.value
    ? getDefaultAvatarSrc(store.detail?.type, store.detail?.gender)
    : getArtistAvatarSrc(store.detail ?? undefined)
)
function onAvatarError() {
  avatarLoadFailed.value = true
}

// ── 相关演出：直接用后端 ArtistDetailResp.events（GetByArtist 直接查 DB 返回已发布活动）
const relatedEvents = computed(() => {
  const detailEvents = store.detail?.events;
  return Array.isArray(detailEvents) ? detailEvents.slice(0, 3) : [];
});

// ── 标题:艺人名(别名一、别名二、…) ──
const titleWithAliases = computed(() => {
  const d = store.detail;
  if (!d) return "";
  const aliasNames = (d.aliases || []).map((a) => a.name).filter(Boolean);
  return aliasNames.length ? `${d.name}(${aliasNames.join("、")})` : d.name;
});

// ── 简介:优先 detail.description,无则空 ──
const description = computed(() => store.detail?.detail?.description || "");

// ── 基本信息标签 ──
const GENDER_LABEL: Record<string, string> = {
  Female: "女",
  Male: "男",
  Other: "其他",
};
const TYPE_LABEL: Record<string, string> = {
  Person: "个人",
  Group: "组合",
  Orchestra: "管弦乐团",
  Choir: "合唱团",
  Character: "虚拟角色",
};
const COUNTRY_LABEL: Record<string, string> = {
  JP: "日本",
  KR: "韩国",
  CN: "中国",
  US: "美国",
  GB: "英国",
  TW: "中国台湾",
  HK: "中国香港",
  SG: "新加坡",
  MY: "马来西亚",
  TH: "泰国",
};

const infoTags = computed(() => {
  const d = store.detail;
  if (!d) return [] as { key: string; icon: string; label: string }[];
  const list: { key: string; icon: string; label: string }[] = [];

  // 主名(中文/原名)
  if (d.name)
    list.push({ key: "name", icon: "/static/detail_icon/name.svg", label: d.name });

  // 第 1 个别名 - 单独 tag,呼应设计稿"我的艺名叫大能能"
  const firstAlias = d.aliases?.[0]?.name;
  if (firstAlias && firstAlias !== d.name) {
    list.push({
      key: "alias-1",
      icon: "/static/detail_icon/name.svg",
      label: firstAlias,
    });
  }

  // 其余别名:合并为一个 tag "别名一、别名二、别名三"（对齐设计稿）
  const restAliases = (d.aliases || [])
    .slice(1)
    .map((a) => a.name)
    .filter(Boolean);
  if (restAliases.length > 0) {
    list.push({
      key: "aliases-rest",
      icon: "/static/detail_icon/name.svg",
      label: restAliases.join("、"),
    });
  }

  // 性别：女/男用对应图标
  if (d.gender) {
    const genderIcon =
      d.gender === "Female"
        ? "/static/icons/female.svg"
        : d.gender === "Male"
        ? "/static/icons/male.svg"
        : "/static/detail_icon/type.svg";
    list.push({
      key: "gender",
      icon: genderIcon,
      label: GENDER_LABEL[d.gender] || d.gender,
    });
  }

  // 生日(原样展示 1996年11月5日 / 1996年11月 / 1996年)
  const bday = d.detail?.birthday;
  if (bday) {
    list.push({
      key: "birthday",
      icon: "/static/detail_icon/date.svg",
      label: formatBirthday(bday),
    });
  }

  // 星座
  const zodiac = zodiacOf(bday);
  if (zodiac)
    list.push({ key: "zodiac", icon: "/static/detail_icon/zodiac.svg", label: zodiac });

  // 国家
  if (d.country) {
    list.push({
      key: "country",
      icon: "/static/detail_icon/country.svg",
      label: COUNTRY_LABEL[d.country] || d.country,
    });
  }

  // 音乐流派/风格（取第1个genre，对齐设计稿第4行左）
  const firstGenre = d.genres?.[0]?.genre_code;
  if (firstGenre) {
    list.push({
      key: "genre",
      icon: "/static/detail_icon/genre.svg",
      label: firstGenre,
    });
  }

  // 类型
  if (d.type)
    list.push({
      key: "type",
      icon: "/static/detail_icon/type.svg",
      label: TYPE_LABEL[d.type] || d.type,
    });

  // 出道日期（设计稿第4行右，格式同生日）
  const debutDate = d.detail?.debut_date;
  if (debutDate) {
    list.push({
      key: "debut",
      icon: "/static/detail_icon/date.svg",
      label: formatBirthday(debutDate),
    });
  }

  // 组合关联：显示组合名（related_name），取第1条 member/group 关系
  const groupRel = (d.relations || []).find((r) => /member|group/i.test(r.relation_type));
  if (groupRel?.related_name) {
    list.push({
      key: "group",
      icon: "/static/detail_icon/group.svg",
      label: `${groupRel.related_name}组合`,
    });
  }

  return list;
});

function formatBirthday(d: string): string {
  if (!d) return "";
  const parts = d.split("-");
  const y = parts[0];
  const m = parts[1] ? parseInt(parts[1], 10) : 0;
  const day = parts[2] ? parseInt(parts[2], 10) : 0;
  if (y && m && day) return `${y}年${m}月${day}日`;
  if (y && m) return `${y}年${m}月`;
  if (y) return `${y}年`;
  return d;
}

// ── 社交按钮:固定 5 个 ──
interface SocialEntry {
  key: string; // 与后端 url_type 匹配的小写关键字
  label: string;
  icon: string;
  url: string | null; // null = 无对应数据置灰
}

const SOCIAL_DEFS: Array<{
  key: string;
  label: string;
  icon: string;
  aliases: string[];
}> = [
  {
    key: "facebook",
    label: "Facebook",
    icon: "/static/icons/social-facebook.svg",
    aliases: ["facebook"],
  },
  {
    key: "line",
    label: "LINE",
    icon: "/static/icons/social-line.svg",
    aliases: ["line"],
  },
  {
    key: "twitter",
    label: "Twitter",
    icon: "/static/icons/social-twitter.svg",
    aliases: ["twitter", "x"],
  },
  {
    key: "skype",
    label: "Skype",
    icon: "/static/icons/social-skype.svg",
    aliases: ["skype"],
  },
  {
    key: "wechat",
    label: "WeChat",
    icon: "/static/icons/social-wechat.svg",
    aliases: ["wechat", "weixin"],
  },
];

const socials = computed<SocialEntry[]>(() => {
  const urls = store.detail?.urls || [];
  return SOCIAL_DEFS.map((def) => {
    const hit = urls.find((u) => {
      const t = (u.url_type || "").toLowerCase();
      return def.aliases.some((a) => t.includes(a));
    });
    return {
      key: def.key,
      label: def.label,
      icon: def.icon,
      url: hit?.url || null,
    };
  });
});

function onSocialTap(s: SocialEntry) {
  if (!s.url) return;
  uni.setClipboardData({
    data: s.url,
    success: () => uni.showToast({ title: "链接已复制", icon: "none" }),
  });
}

// ── 作品集:日期格式化 ──
function formatWorkDate(d: string): string {
  if (!d) return "";
  const parts = d.split("-");
  const y = parts[0];
  const m = parts[1] ? parseInt(parts[1], 10) : 0;
  const day = parts[2] ? parseInt(parts[2], 10) : 0;
  if (y && m && day) return `${y}年${m}月${day}日`;
  if (y && m) return `${y}年${m}月`;
  if (y) return `${y}年`;
  return d;
}

// ── 右上书签:订阅/退订 ──
const isSubscribed = computed(() =>
  store.detail ? subscribeStore.isArtistSubscribed(store.detail.id) : false
);

/**
 * App 端订阅：系统推送是长期订阅，订阅成功后确保本机已拿到系统通知权限并上报 cid。
 */
async function ensurePushReady() {
  const granted = await useNotificationStore().requestSystemNotifyPermission();
  if (!granted) {
    uni.showToast({
      title: "已订阅，请到系统设置中允许通知",
      icon: "none",
      duration: 2500,
    });
    return;
  }
  await syncPushToken();
}

function onToggleSubscribe() {
  const d = store.detail;
  if (!d) return;

  userStore.requireLogin({
    dismissible: true,
    reason: "artist_detail_subscribe",
    onSuccess: async () => {
      try {
        const nowSubscribed = await subscribeStore.toggleArtist(d.id);
        if (nowSubscribed) {
          await ensurePushReady();
        }
        uni.showToast({
          title: nowSubscribed ? "已订阅" : "已退订",
          icon: "success",
        });
      } catch (e: any) {
        uni.showToast({ title: e?.message || "操作失败", icon: "none" });
      }
    },
  });
}

// ── 跳转 ──
function goBack() {
  uni.navigateBack();
}
function toEvent(id: number) {
  uni.navigateTo({ url: `/pages/event/detail?id=${id}` });
}
function toEventList() {
  uni.navigateTo({ url: "/pages/event/list" });
}
</script>

<style scoped>
.page {
  background: #fff;
  min-height: 100vh;
}

/* 顶部导航 */
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 30rpx;
  padding-right: 30rpx;
  padding-bottom: 20rpx;
}
.nav-back {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex: 1;
}
.nav-title {
  font-size: 34rpx;
  font-weight: 600;
  color: rgba(51, 51, 51, 1);
}
.nav-right {
  display: flex;
  gap: 16rpx;
}
.nav-circle-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 32rpx;
  background: #fff;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 4rpx 12rpx 0 rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s;
}
.nav-circle-btn--hover {
  opacity: 0.7;
}
.nav-circle-btn--on {
  background: #000;
  border-color: #000;
}
.nav-subscribe-icon {
  width: 90%;
  height: 90%;
}
.nav-btn-text {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
  line-height: 1;
}
.nav-btn-text--on {
  color: #fff;
}

.scroll-body {
  flex: 1;
}

/* 艺术家粉色卡片 */
.artist-card {
  margin: 22rpx 30rpx 0;
  background: rgba(255, 182, 182, 1);
  border-radius: 30rpx;
  border: 1rpx solid rgba(245, 131, 135, 1);
  box-shadow: 0 10rpx 20rpx 0 rgba(255, 216, 217, 1);
  padding: 30rpx 28rpx 24rpx;
}
.card-row {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-bottom: 24rpx;
}
.avatar-wrap {
  width: 130rpx;
  height: 130rpx;
  border-radius: 50%;
  border: 6rpx solid rgba(255, 255, 255, 1);
  overflow: hidden;
  flex-shrink: 0;
}
.avatar {
  width: 100%;
  height: 100%;
  background: #fff;
}
.card-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #fff;
  line-height: 1.5;
  flex: 1;
  word-wrap: break-word;
  word-break: break-all;
}
.card-desc {
  display: block;
  font-size: 26rpx;
  color: #fff;
  line-height: 1.6;
  margin-bottom: 24rpx;
  word-break: break-all;
}

.info-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}
.info-tag {
  background: #fff;
  border-radius: 20rpx;
  padding: 10rpx 18rpx;
  display: flex;
  align-items: center;
  gap: 6rpx;
  max-width: 100%;
  overflow: hidden;
}
.info-tag-icon {
  width: 28rpx;
  height: 28rpx;
  flex-shrink: 0;
}
.tag-label {
  font-size: 24rpx;
  color: rgba(51, 51, 51, 1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 社交按钮 */
.social-row-wrap {
  margin: 24rpx 30rpx 0;
  background: #fff;
  border-radius: 24rpx;
  /* padding: 36rpx 16rpx; */
  box-shadow: 0 4rpx 20rpx 0 rgba(0, 0, 0, 0.06);
}
.social-row {
  display: flex;
  justify-content: space-around;
  align-items: center;
}
.social-btn {
  display: flex;
  align-items: center;
  justify-content: center;
}
.social-icon {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50rpx;
  overflow: hidden;
}

.section-title-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 20rpx;
  padding: 20rpx 30rpx;
}
.section-title {
  font-size: 32rpx;
  font-weight: 700;
  color: rgba(35, 34, 39, 1);
  position: relative;
  padding-bottom: 4rpx;
}
.section-title--highlight::after {
  content: "";
  position: absolute;
  left: -6rpx;
  bottom: 2rpx;
  width: calc(100% + 12rpx);
  height: 10rpx;
  background: rgba(254, 210, 0, 0.7);
  border-radius: 4rpx;
  z-index: -1;
}
.section-all {
  font-size: 26rpx;
  color: rgba(35, 34, 39, 1);
}

.no-event {
  background: #fff;
  border-radius: 30rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  padding: 40rpx;
  text-align: center;
}
.no-event-text {
  font-size: 26rpx;
  color: rgba(153, 153, 153, 1);
}

/* 作品集 */
.works-card {
  background: #fff;
  border-radius: 30rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 10rpx 30rpx 0 rgba(0, 0, 0, 0.05);
  padding: 24rpx 30rpx;
}
.work-item {
  padding: 12rpx 0;
}
.work-title {
  display: block;
  font-size: 26rpx;
  color: rgba(35, 34, 39, 1);
  line-height: 1.6;
  font-weight: 500;
}
.work-desc {
  display: block;
  font-size: 24rpx;
  color: rgba(153, 153, 153, 1);
  line-height: 1.6;
  margin-top: 6rpx;
  padding-left: 20rpx;
}

.loading {
  text-align: center;
  padding: 100rpx;
  color: #aaa;
}
</style>
