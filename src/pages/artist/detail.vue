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
          <!-- 艺人卡片：底色/文字用该艺人的主题色（与活动卡片同色） -->
          <view
            class="artist-card"
            :style="{
              background: theme.base,
              borderColor: withAlpha(theme.ink, 0.18),
              boxShadow: `0 10rpx 20rpx 0 ${withAlpha(theme.ink, 0.14)}`,
            }"
          >
            <view class="card-row">
              <view class="avatar-wrap">
                <image class="avatar" :src="avatarSrc" mode="aspectFill" @error="onAvatarError" />
              </view>
              <text class="card-name" :style="{ color: theme.ink }">{{ titleWithAliases }}</text>
            </view>
            <text v-if="description" class="card-desc" :style="{ color: theme.ink }">{{ description }}</text>

            <!-- 订阅人数：与右上角书签订阅同一份数据，订阅/退订成功后由后端失效缓存 -->
            <view class="card-subscriber" :style="{ color: theme.ink }">
              <image class="card-subscriber-icon" src="/static/detail_icon/collect.svg" mode="aspectFit" />
              <text class="card-subscriber-text">{{ subscriberText }}</text>
            </view>

            <!-- 基本信息标签:流式排布 -->
            <view class="info-tags">
              <view v-for="t in infoTags" :key="t.key" class="info-tag">
                <image class="info-tag-icon" :src="t.icon" mode="aspectFit" />
                <text class="tag-label">{{ t.label }}</text>
              </view>
            </view>
          </view>

          <!-- 社交按钮:无链接的置灰,点击提示「暂无该平台链接」 -->
          <view class="social-row-wrap">
            <view class="social-row">
              <view
                v-for="s in socials"
                :key="s.key"
                class="social-btn"
                :class="{ 'social-btn--empty': !s.url }"
                @click="onSocialTap(s)"
              >
                <image class="social-icon" :src="s.icon" mode="aspectFill" />
              </view>
            </view>
          </view>

          <!-- 组合成员：仅组合类艺人显示，点击进入成员详情 -->
          <view v-if="members.length" class="section-pad">
            <view class="section-title-row">
              <text class="section-title section-title--highlight">组合成员</text>
              <text class="section-all">{{ members.length }} 位</text>
            </view>
            <view class="members-card">
              <view
                v-for="m in visibleMembers"
                :key="m.id"
                class="member-item"
                hover-class="member-item--hover"
                @click="toMember(m)"
              >
                <image class="member-avatar" :src="m.avatar" mode="aspectFill" />
                <view class="member-meta">
                  <text class="member-name">{{ m.name }}</text>
                  <text v-if="m.country" class="member-country">{{
                    artistRegionLabel(m.country)
                  }}</text>
                </view>
                <uni-icons type="right" size="small" color="#C0C4CC" />
              </view>
            </view>
            <view v-if="members.length > visibleMembers.length" class="list-cap">
              <text class="list-cap-text"
                >仅显示前 {{ visibleMembers.length }} 位，共 {{ members.length }} 位</text
              >
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
                variant="flat"
                :entryGenreCode="store.detail?.genres?.[0]?.genre_code"
                :theme-artist-id="store.detail?.id"
                :theme-color="store.detail?.theme_color"
                @select="toEvent"
              />
            </view>
            <view v-else class="no-event"
              ><text class="no-event-text">暂无演出安排</text></view
            >
          </view>

          <!-- 作品集 -->
          <view class="section-pad" v-if="works.length">
            <view class="section-title-row">
              <text class="section-title section-title--highlight">作品集</text>
            </view>
            <view class="works-card">
              <view v-for="w in visibleWorks" :key="w.id" class="work-item">
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
            <view v-if="works.length > visibleWorks.length" class="list-cap">
              <text class="list-cap-text"
                >仅显示前 {{ visibleWorks.length }} 个作品，共 {{ works.length }} 个</text
              >
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
import { onLoad, onShow } from "@dcloudio/uni-app";
import { useArtistStore } from "@/stores/artist";
import { useSubscribeStore } from "@/stores/subscribe";
import { useUserStore } from "@/stores/user";
import { useNotificationStore } from "@/stores/notification";
import { syncPushToken } from "@/composables/usePush";
import EventCard from "@/components/EventCard/index.vue";
import { resolveArtistTheme, withAlpha } from "@/constants/artistTheme";
import { artistGenderLabel, artistTypeLabel } from "@/constants/artistLabels";
import { artistRegionLabel } from "@/constants/artistCountries";
import { zodiacOf } from "@/utils/zodiac";
import { getArtistAvatarSrc, getDefaultAvatarSrc } from "@/utils/avatar";
import { getNavBarMetrics } from "@/utils/system";
import { openExternalUrl } from "@/utils/openExternal";
const artistStore = useArtistStore();
const subscribeStore = useSubscribeStore();
const userStore = useUserStore();
const store = artistStore;
const statusBarHeight = ref(20);
const navRightPadding = ref(16);

/** 本页面正在浏览的艺人 id。store.detail 是全局共享槽位，需要靠它判断数据是否被顶掉。 */
const artistId = ref("");

onLoad((options) => {
  const id = options?.id;
  if (!id || id === "undefined") {
    uni.showToast({ title: "艺术家ID缺失", icon: "none" });
    return;
  }
  artistId.value = id;
  artistStore.fetchDetail(id);
  // 不再请求全量活动列表 — 关联活动由 artistApi.detail 返回的 events 字段提供
});

/**
 * 返回时自愈：从成员详情 navigateBack 回来时，onLoad 不会重跑，
 * 而 store.detail 已被成员页的 fetchDetail 覆盖成成员，于是组合页渲染的是成员内容，
 * 表现为「点了返回没回到偶像详情页」。
 * 这里按 id 比对，数据对不上就重新拉一次；对得上（成员→活动详情→返回）则完全跳过请求。
 */
onShow(() => {
  if (!artistId.value) return;
  if (store.detail?.id !== artistId.value) {
    // 先清空再拉：直接保留旧值的话，返回瞬间会先渲染出成员的头像/名字，
    // 等组合数据回来才跳变，看起来像 glitch。清空后走 v-else 的「加载中...」，
    // 是一段正常的加载态而不是错误内容。
    artistStore.detail = null;
    artistStore.fetchDetail(artistId.value);
  }
  // 换人后要重置头像降级标记，否则上一位艺人的加载失败会污染当前页
  avatarLoadFailed.value = false;
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

// ── 主题色 ──
// 与活动卡片（EventCard）取同一个色：该艺人配了就用配的，没配按 id 哈希取预设色
const theme = computed(() =>
  resolveArtistTheme(store.detail?.theme_color, store.detail?.id),
);

// ── 简介:优先 detail.description,无则空 ──
const description = computed(() => store.detail?.detail?.description || "");

// gender / type 的中文文案统一走 @/constants/artistLabels，
// 本页不再自带一份映射表（此前与 SearchOverlay 各写一份且大小写不一致，
// 导致同一性别在详情页显示「女」、在搜索结果里显示「male」）。

// ── 订阅数 ──
// 后端详情接口单独返回 subscriber_count（列表接口本来就有，详情接口这次才补上）。
// null / undefined 都按 0 处理——后端 count 查询失败时会吞错填 0。
const subscriberCount = computed(() => {
  const n = store.detail?.subscriber_count;
  return typeof n === "number" && n > 0 ? n : 0;
});
// 万以上才折算，避免「1.2万人订阅」这种误导性文案出现在小数据量上
const subscriberText = computed(() => {
  const n = subscriberCount.value;
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万人订阅`;
  return `${n} 人订阅`;
});
/**
 * 国家/地区文案统一走 @/constants/artistCountries 的 artistRegionLabel，
 * 本页不再自带一份映射表（此前这份只有 10 条，加拿大 / 巴西 / 印度 / 尼日利亚
 * 等艺人在详情页会直接显示裸 ISO 码，且与偶像首页的分组标签表不一致）。
 */

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
  // 图标按小写值匹配；文案走 artistGenderLabel（内部同样小写化查表）
  if (d.gender) {
    const g = d.gender.toLowerCase();
    const genderIcon =
      g === "female"
        ? "/static/icons/female.svg"
        : g === "male"
        ? "/static/icons/male.svg"
        : "/static/detail_icon/type.svg";
    list.push({
      key: "gender",
      icon: genderIcon,
      label: artistGenderLabel(d.gender),
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
      label: artistRegionLabel(d.country),
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
      label: artistTypeLabel(d.type),
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

  // 所属组合：只有当关联对象本身是 Group 时才算「组合」。
  // 不能只看 relation_type——组合自己的 relations 同样是 member，
  // 原来的写法会让 YOASOBI 的详情页出现「ayase组合」这种 nonsense。
  const groupRel = (d.relations || []).find(
    (r) => /member|group/i.test(r.relation_type) && r.related_type?.toLowerCase() === "group"
  );
  if (groupRel?.related_name) {
    list.push({
      key: "group",
      icon: "/static/detail_icon/group.svg",
      label: `${groupRel.related_name}组合`,
    });
  }

  return list;
});

// ── 组合成员 ──
interface MemberEntry {
  id: string;
  name: string;
  avatar: string;
  country: string;
}

/**
 * 当前艺人是组合时，relations 里 relation_type=member 的就是它的成员。
 * related_id 为空（历史脏数据/成员已删除）直接过滤掉——没有 id 就跳不过去，
 * 渲染一个点不动的卡片只会让用户困惑。
 */
const members = computed<MemberEntry[]>(() => {
  const d = store.detail;
  if (!d || d.type?.toLowerCase() !== "group") return [];
  return (d.relations || [])
    .filter((r) => /member/i.test(r.relation_type || "") && r.related_id)
    .map((r) => ({
      id: r.related_id,
      name: r.related_name || r.related_id,
      // 库里配了真实头像就用配置图，没配（related_avatar_url 为空串）时
      // 由 getArtistAvatarSrc 按 type/gender 兜底，避免女成员显示男头像。
      avatar: getArtistAvatarSrc({
        avatar_url: r.related_avatar_url || undefined,
        type: r.related_type,
        gender: r.related_gender,
      }),
      country: r.related_country || "",
    }));
});

/**
 * 组合成员展示上限。
 *
 * 大型组合（成员几十人）会把这一段撑得很长，每个成员还带一张头像 ——
 * 头像解码进内存，比节点本身重得多。24 个够看，超出部分折叠并给出提示。
 */
const MEMBERS_MAX = 24;
const visibleMembers = computed(() => members.value.slice(0, MEMBERS_MAX));

/** 作品集展示上限（同上：条目随运营数据无上限增长） */
const WORKS_MAX = 20;
const works = computed(() => store.detail?.works ?? []);
const visibleWorks = computed(() => works.value.slice(0, WORKS_MAX));

function toMember(m: MemberEntry) {
  if (!m.id) return;
  uni.navigateTo({ url: `/pages/artist/detail?id=${m.id}` });
}

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

// ── 社交按钮 ──
// 匹配规则从「子串模糊匹配」改为「精确匹配别名表」。
// 原来用 url_type.includes('x') 判 Twitter，mixcloud / bandcamp 这类值会误命中；
// includes('line') 更是把 offline 之类也捞进来。url_type 是后台自由文本，
// 宁可漏匹配（按钮置灰），也不能把链接挂到错误的平台上。
interface SocialEntry {
  key: string;
  label: string;
  icon: string;
  url: string | null; // null = 无对应数据，置灰不可点
}

const SOCIAL_DEFS: Array<{
  key: string;
  label: string;
  icon: string;
  aliases: string[];
}> = [
  {
    key: "twitter",
    label: "Twitter",
    icon: "/static/icons/social-twitter.svg",
    aliases: ["twitter", "x", "x (twitter)", "twitter/x"],
  },
  {
    key: "instagram",
    label: "Instagram",
    icon: "/static/icons/social-instagram.svg",
    aliases: ["instagram"],
  },
  {
    key: "youtube",
    label: "YouTube",
    icon: "/static/icons/social-youtube.svg",
    aliases: ["youtube", "youtube music", "youtube channel"],
  },
  {
    key: "website",
    label: "官网",
    icon: "/static/icons/social-website.svg",
    aliases: ["official homepage", "official website", "homepage", "website", "official site"],
  },
  {
    key: "music",
    label: "音乐平台",
    icon: "/static/icons/social-music.svg",
    aliases: ["streaming", "apple music", "spotify", "free streaming"],
  },
  {
    key: "wechat",
    label: "WeChat",
    icon: "/static/icons/social-wechat.svg",
    aliases: ["wechat", "weixin"],
  },
  {
    key: "weibo",
    label: "微博",
    icon: "/static/icons/social-weibo.svg",
    aliases: ["weibo", "sina weibo"],
  },
  {
    key: "line",
    label: "LINE",
    icon: "/static/icons/social-line.svg",
    aliases: ["line"],
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: "/static/icons/social-facebook.svg",
    aliases: ["facebook", "facebook page"],
  },
];

const socials = computed<SocialEntry[]>(() => {
  // 后端把头像(image/avatar)、biography、discogs 这类行也原样塞进 urls，
  // 精确匹配天然会把它们过滤掉，不用在前端再维护一份黑名单。
  const urls = (store.detail?.urls || []).filter((u) => u.url && u.url.trim());
  return SOCIAL_DEFS.map((def) => {
    const hit = urls.find((u) => {
      const t = (u.url_type || "").trim().toLowerCase();
      return def.aliases.includes(t);
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
  if (!s.url) {
    uni.showToast({ title: `暂无${s.label}链接`, icon: "none" });
    return;
  }
  // 交给系统处理：http(s) 走浏览器或已装 App，协议白名单校验在 openExternalUrl 内。
  // 原来这里是 setClipboardData —— 用户点社交图标预期是「打开」，复制到剪贴板
  // 既无反馈也无法直达，两者是完全不同的交互。
  openExternalUrl(s.url, s.label);
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

/* 艺人卡片：底色与文字由内联 theme.base / theme.ink 覆盖（见模板） */
.artist-card {
  margin: 22rpx 30rpx 0;
  background: #e4e5e9;
  border-radius: 30rpx;
  border: 1rpx solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 10rpx 20rpx 0 rgba(0, 0, 0, 0.08);
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
  /* 底色已改为浅色主题底，白字不可读；实际颜色由内联 theme.ink 覆盖 */
  color: #333;
  line-height: 1.5;
  flex: 1;
  word-wrap: break-word;
  word-break: break-all;
}
.card-desc {
  display: block;
  font-size: 26rpx;
  /* 同上，实际颜色由内联 theme.ink 覆盖 */
  color: #555;
  line-height: 1.6;
  margin-bottom: 24rpx;
  word-break: break-all;
}

/* 订阅人数：放在简介下方，和上面 gap 24rpx 对齐 */
.card-subscriber {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
}
.card-subscriber-icon {
  width: 28rpx;
  height: 28rpx;
  margin-right: 8rpx;
  /* 图标是深色描边图，放在浅色主题底上会糊，加一层半透明白衬底 */
  opacity: 0.75;
}
.card-subscriber-text {
  font-size: 24rpx;
  /* 颜色由内联 theme.ink 覆盖 */
  color: #555;
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
  /* 平台数量会随 SOCIAL_DEFS 增长，固定每行 5 个并允许换行，
     否则 9 个图标挤在一行会被压到 76rpx */
  flex-wrap: wrap;
  padding: 20rpx 0;
}
.social-btn {
  width: 20%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14rpx 0;
}
.social-icon {
  width: 108rpx;
  height: 108rpx;
  border-radius: 24rpx;
  overflow: hidden;
}
/* 无链接的平台置灰。之前注释写了「置灰」但一直没实现，
   5 个图标全亮着、点下去又毫无反馈，用户会以为功能坏了 */
.social-btn--empty {
  opacity: 0.38;
  filter: grayscale(1);
}

/* 区块统一左右留白。
   .section-title-row 自带 padding:20rpx 30rpx，卡片却直接顶到屏幕两边 ——
   这个类之前全项目都没有定义。补 margin 后必须把标题行的水平 padding 去掉，
   否则标题会变成 30 + 30 = 60rpx 双重缩进，和卡片对不齐 */
.section-pad {
  margin: 0 30rpx;
}

.section-title-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 20rpx;
  /* 水平留白交给 .section-pad，这里只留垂直间距 */
  padding: 20rpx 0;
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

/* 列表折叠提示（如「仅显示前 24 位，共 38 位」） */
.list-cap {
  display: flex;
  justify-content: center;
  padding: 20rpx 0 4rpx;
}
.list-cap-text {
  font-size: 22rpx;
  color: rgba(153, 153, 153, 1);
}

/* 组合成员 */
.members-card {
  background: #fff;
  border-radius: 30rpx;
  border: 1rpx solid rgba(236, 236, 236, 1);
  box-shadow: 0 10rpx 30rpx 0 rgba(0, 0, 0, 0.05);
  /* 竖向 padding 略小于作品集，成员本身行高就小，太多留白会显得松散 */
  padding: 8rpx 30rpx;
}
.member-item {
  display: flex;
  align-items: center;
  /* 每个成员之间一条极淡的分隔线，最后一条不画（用 :last-child 兜掉） */
  border-bottom: 1rpx solid rgba(240, 240, 240, 1);
  padding: 20rpx 0;
}
.member-item:last-child {
  border-bottom: none;
}
.member-item--hover {
  background: rgba(0, 0, 0, 0.03);
}
.member-avatar {
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  /* 库里的默认头像是白底图，加浅描边避免和卡片融在一起 */
  background: #f5f6f8;
  flex-shrink: 0;
}
.member-meta {
  flex: 1;
  /* margin-left:auto 让 uni-icons 靠右贴边，同时保证长名字有 ellipsis 的宽度上限 */
  margin-left: 20rpx;
  margin-right: 12rpx;
  overflow: hidden;
}
.member-name {
  display: block;
  font-size: 28rpx;
  color: rgba(35, 34, 39, 1);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.member-country {
  display: block;
  font-size: 22rpx;
  color: rgba(120, 124, 133, 1);
  margin-top: 4rpx;
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
