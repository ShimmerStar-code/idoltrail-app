<template>
  <PageLayout>
    <view class="page">
      <!-- NavBar -->
      <view class="navbar" :style="{ paddingTop: statusBarHeight + 'px' }">
        <view class="navbar-inner" :style="{ paddingRight: navRightPadding + 'px' }">
          <view class="nav-back" @tap="goBack">
            <uni-icons type="left" size="large" color="#333" />
            <text class="nav-back-label">活动详情</text>
          </view>
          <view class="nav-actions">
            <!-- <text class="nav-icon">👁</text> -->
            <!-- <text class="nav-icon">🔖</text> -->
            <view
              class="nav-subscribe-btn"
              @click.stop="onToggleSubscribe"
              hover-class="nav-subscribe-btn--hover"
            >
              <image
                class="nav-subscribe-icon"
                :src="
                  isSubscribed
                    ? '/static/icons/subscribed.svg'
                    : '/static/icons/subscribe_icon.svg'
                "
                mode="aspectFit"
              />
            </view>
          </view>
        </view>
      </view>

      <!-- 骨架屏：数据清空后显示，避免空白闪烁 -->
      <view v-if="store.loading && !d" class="skeleton">
        <view class="sk-card">
          <view class="sk-avatar" />
          <view class="sk-line sk-title" />
          <view class="sk-chips">
            <view class="sk-chip" />
            <view class="sk-chip" />
            <view class="sk-chip sk-chip-sm" />
          </view>
          <view class="sk-line sk-short" />
          <view class="sk-row">
            <view class="sk-cell" />
            <view class="sk-cell" />
            <view class="sk-cell" />
          </view>
        </view>
        <view class="sk-section">
          <view class="sk-line sk-half" />
          <view class="sk-artist-row">
            <view v-for="i in 4" :key="i" class="sk-artist" />
          </view>
        </view>
        <view class="sk-section">
          <view class="sk-line sk-half" />
          <view class="sk-poster" />
        </view>
      </view>

      <view v-if="d" class="content">
        <!-- 信息卡片：底色用主艺人主题色（与活动卡片/艺人详情页同色） -->
        <view class="card" :style="{ background: theme.base }">
          <view class="avatar-wrap">
            <image class="avatar" :src="firstArtistAvatar" mode="aspectFill" />
          </view>
          <view class="card-body">
            <view class="title-card">
              <!-- 状态胶囊：已结束/延期/已取消（按当天日期派生，每次进入页面即重判） -->
              <view
                v-if="statusPillText"
                class="event-status-pill"
                :style="{ background: statusPillStyle.bg }"
              >
                <text
                  class="event-status-pill-text"
                  :style="{ color: statusPillStyle.fg }"
                >{{ statusPillText }}</text>
              </view>
              <text class="event-title">{{ d.title }}</text>
            </view>

            <!-- 艺人标签 chips -->
            <view class="chips">
              <template v-if="validArtists.length > 0">
                <view v-for="a in displayedArtists" :key="a.artist_name" class="chip">
                  {{ a.artist_name }}
                </view>
              </template>
              <view v-else class="chip chip--pending">待定</view>
            </view>
            <view
              v-if="validArtists.length > CHIP_LIMIT"
              class="see-all"
              @tap="expanded = !expanded"
            >
              <text class="see-all-text" :style="{ color: theme.ink }">{{ expanded ? "▴ 收起" : "▾ 查看所有" }}</text>
            </view>

            <!-- 上传用户（发布者）单独一行 -->
            <view class="card-organizer-row">
              <image
                class="card-type-icon"
                src="/static/detail_icon/organizer.svg"
                mode="aspectFit"
              />
              <text class="card-type-text card-type-text--ellipsis">{{
                d.organizer
              }}</text>
            </view>

            <!-- 活动类型 + 收藏数 + 点赞数 -->
            <view class="card-type-row">
              <view class="card-type-item">
                <image
                  class="card-type-icon"
                  src="/static/detail_icon/event-type.svg"
                  mode="aspectFit"
                />
                <text class="card-type-text card-type-text--ellipsis">{{
                  typeLabel || "待定"
                }}</text>
              </view>
              <view
                class="card-stat card-stat--clickable"
                :class="{ 'card-stat--subscribed': isSubscribed }"
                hover-class="card-stat--hover"
                @click="onToggleSubscribe"
              >
                <image
                  class="card-stat-icon"
                  :src="
                    isSubscribed
                      ? '/static/icons/subscribed.svg'
                      : '/static/detail_icon/collect.svg'
                  "
                  mode="aspectFit"
                />
                <text
                  class="card-stat-val"
                  :class="{ 'card-stat-val--active': isSubscribed }"
                  >{{ subscribeCount }}</text
                >
              </view>
              <view class="card-stat card-stat--clickable" @click="onToggleLike">
                <image
                  class="card-stat-icon"
                  :src="
                    isLiked
                      ? '/static/detail_icon/like_active.svg'
                      : '/static/detail_icon/like.svg'
                  "
                  mode="aspectFit"
                />
                <text
                  class="card-stat-val"
                  :class="{ 'card-stat-val--liked': isLiked }"
                  >{{ likesCount }}</text
                >
              </view>
            </view>

            <!-- 贡献者：这条活动信息是谁提供的。粉丝上报并被采用才有，运营直接录入的没有 -->
            <view v-if="contributorNames" class="card-contributor-row">
              <image
                class="card-type-icon"
                src="/static/detail_icon/contributor.svg"
                mode="aspectFit"
              />
              <text class="card-contributor-label">贡献者：</text>
              <text class="card-contributor-name">{{ contributorNames }}</text>
            </view>
          </view>
        </view>

        <!-- ── 场次信息 ──
             原本是 swiper 轮播，但 swiper 必须写死高度，场次时间一多内容就被
             .session-content 的 overflow-y:auto 关进卡片内部，得在卡片里再上下拉一次，
             嵌套滚动很难受。改为「顶部横向场次导航 + 下方只渲染当前场次」：
             卡片高度随内容自适应，整页滚动即可看完，不再有内部滚动区。 -->
        <view
          v-if="d.sessions && d.sessions.length > 0"
          class="sessions-section"
        >
          <!-- 多场次才给导航条；单场次时标题本身已经说清楚了一切 -->
          <scroll-view
            v-if="d.sessions.length > 1"
            scroll-x
            class="session-tabs-scroll"
            :show-scrollbar="false"
          >
            <view class="session-tabs">
              <view
                v-for="(s, i) in visibleSessions"
                :key="s.id || i"
                class="session-tab"
                :class="{ 'session-tab--active': i === activeSessionIdx }"
                :style="
                  i === activeSessionIdx
                    ? {
                        background: withAlpha(theme.ink, 0.1),
                        borderColor: withAlpha(theme.ink, 0.3),
                      }
                    : {}
                "
                @tap="selectSession(i)"
              >
                <text
                  class="session-tab-text"
                  :style="i === activeSessionIdx ? { color: theme.ink } : {}"
                  >{{ sessionLabel(s, i, d.sessions.length) }}</text
                >
              </view>
            </view>
          </scroll-view>

          <view v-if="currentSession" class="session-card">
            <view
              class="session-header"
              :style="{ background: withAlpha(theme.ink, 0.08) }"
            >
              <view class="session-badge">
                <text class="session-badge-text" :style="{ color: theme.ink }">{{
                  sessionLabel(
                    currentSession,
                    activeSessionIdx,
                    d.sessions.length
                  )
                }}</text>
              </view>
              <view v-if="d.sessions.length > 1" class="session-count">
                <text class="session-count-text" :style="{ color: theme.ink }">{{
                  activeSessionIdx + 1 }} / {{ d.sessions.length }}</text
                >
              </view>
            </view>

            <view
              class="session-content"
              :style="{
                '--ti': withAlpha(theme.ink, 0.12),
                '--ti-soft': withAlpha(theme.ink, 0.07),
              }"
            >
              <!-- 城市 -->
              <view class="detail-row">
                <view class="detail-icon-wrap">
                  <image
                    class="dico-img"
                    src="/static/detail_icon/city.svg"
                    mode="aspectFit"
                  />
                </view>
                <text class="dtxt">{{
                  formatCityCountry(currentSession.city, currentSession.country) || "待定"
                }}</text>
              </view>

              <!-- 时间列表 -->
              <view
                v-if="currentSession.times && currentSession.times.length > 0"
                :class="[
                  'detail-row',
                  currentSession.times.length > 1 && 'detail-row--times',
                ]"
              >
                <view class="detail-icon-wrap">
                  <image
                    class="dico-img"
                    src="/static/detail_icon/time.svg"
                    mode="aspectFit"
                  />
                </view>
                <text v-if="currentSession.times.length === 1" class="dtxt">{{
                  formatSessionTime(currentSession.times[0])
                }}</text>
                <view v-else class="dtxt-list">
                  <text
                    v-for="(t, i) in visibleSessionTimes"
                    :key="i"
                    class="dtxt-list-item"
                    >{{ formatSessionTime(t) }}</text
                  >
                </view>
              </view>

              <!-- 场馆：绑定了 place_id 才可点，跳场馆详情页 -->
              <view
                v-if="currentSession.place_name"
                class="detail-row"
                :hover-class="currentSession.place_id ? 'detail-row-hover' : ''"
                :hover-stay-time="120"
                @tap="goPlace(currentSession)"
              >
                <view class="detail-icon-wrap">
                  <image
                    class="dico-img"
                    src="/static/detail_icon/venue.svg"
                    mode="aspectFit"
                  />
                </view>
                <text class="dtxt">{{ currentSession.place_name }}</text>
                <text v-if="currentSession.place_id" class="dtxt-arrow"
                  >›</text
                >
              </view>

              <!-- 地址：有经纬度才可点，调起系统地图 -->
              <view
                v-if="currentSession.address"
                class="detail-row"
                :hover-class="hasCoords(currentSession) ? 'detail-row-hover' : ''"
                :hover-stay-time="120"
                @tap="openMap(currentSession)"
              >
                <view class="detail-icon-wrap">
                  <image
                    class="dico-img"
                    src="/static/detail_icon/location.svg"
                    mode="aspectFit"
                  />
                </view>
                <text class="dtxt">{{ currentSession.address }}</text>
                <text v-if="hasCoords(currentSession)" class="dtxt-arrow"
                  >›</text
                >
              </view>
            </view>
          </view>
        </view>

        <!-- ── 演出阵容 ── -->
        <view v-if="d.artists.length" class="section">
          <view class="notice-title-wrap">
            <view class="notice-title-bar"></view>
            <text class="section-title notice-section-title">演出阵容</text>
          </view>
          <scroll-view scroll-x class="artist-scroll">
            <view class="artist-list">
              <view
                v-for="(a, i) in visibleArtists"
                :key="`${a.artist_name}-${i}`"
                class="artist-card"
                @tap="a.artist_id ? goToArtist(a.artist_id) : undefined"
                :style="a.artist_id ? 'cursor:pointer' : ''"
              >
                <image
                  class="artist-avatar"
                  :src="getArtistAvatarSrc(a)"
                  mode="aspectFill"
                />
                <text class="artist-name">{{ a.artist_name }}</text>
                <text class="artist-role">{{
                  ROLE_MAP[a.role_type] ?? a.role_type
                }}</text>
              </view>
            </view>
          </scroll-view>
        </view>

        <!-- ── 购票 ── -->
        <view v-if="ticketList.length" class="section">
          <view class="notice-title-wrap">
            <view class="notice-title-bar"></view>
            <text class="section-title notice-section-title">购票</text>
          </view>
          <!-- 只展示渠道名称，链接在点击时才拿出去：详情页上铺开一排
               长 URL 既没人读，也会把有限的屏幕挤成乱流 -->
          <view class="ticket-list">
            <view
              v-for="(t, i) in ticketList"
              :key="`${t.name}-${i}`"
              class="ticket-item"
              hover-class="ticket-item-hover"
              @tap="goTicket(t)"
            >
              <text class="ticket-name">{{ t.name }}</text>
              <text class="ticket-arrow">›</text>
            </view>
          </view>
        </view>

        <!-- ── 演出介绍 ── -->
        <view class="section">
          <view class="notice-title-wrap">
            <view class="notice-title-bar"></view>
            <text class="section-title notice-section-title">演出介绍</text>
          </view>
          <image
            v-if="d.poster_url"
            :src="posterSrc"
            class="poster"
            mode="widthFix"
            lazy-load
          />
          <text v-if="d.description" class="event-description">{{ d.description }}</text>
          <text v-if="!d.poster_url && !d.description" class="no-content">暂无介绍</text>
        </view>

        <!-- ── 观演须知 ── -->
        <view class="section">
          <view class="notice-title-wrap">
            <view class="notice-title-bar"></view>
            <text class="section-title notice-section-title">
              {{ noticeIsGeneric ? "观演须知（通用提示）" : "观演须知" }}
            </text>
          </view>
          <view v-if="noticeIsGeneric" class="notice-source-tip">
            本场未提供专属须知，以下为通用入场提示，请以现场公告为准。
          </view>
          <view class="notice-box">
            <view v-for="(item, i) in noticeItems" :key="i" class="notice-item">
              <view class="notice-head">
                <text class="notice-bullet">•</text>
                <text class="notice-title">{{ item.title }}</text>
              </view>
              <text class="notice-body">{{ item.body }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else class="empty">{{
        store.loading ? "加载中..." : "活动信息不存在"
      }}</view>
    </view>
  </PageLayout>
</template>

<script setup lang="ts">
import PageLayout from "@/components/PageLayout/index.vue";
import { getArtistAvatarSrc } from "@/utils/avatar";
import { useEventStore } from "@/stores/event";
import { useSubscribeStore } from "@/stores/subscribe";
import { useUserStore } from "@/stores/user";
import { useNotificationStore } from "@/stores/notification";
import { syncPushToken } from "@/composables/usePush";
import { switchTabPage } from "@/utils/pages";
import { getNavBarMetrics } from "@/utils/system";
import { openExternalUrl } from "@/utils/openExternal";
import { posterThumb } from "@/utils/image";
import { formatCity } from "@/constants/cities";
import { formatCityCountry } from "@/constants/countries";
import { resolveArtistTheme, withAlpha } from "@/constants/artistTheme";
import type { EventSession } from "@/types/event";
import {
  EVENT_TYPE_LABEL,
  EVENT_STATUS_OPTIONS,
  STATUS_BADGE_STYLE,
  effectiveEventStatus,
  GENERIC_AUDIENCE_NOTICE,
} from "@/constants/eventMeta";
import { onLoad } from "@dcloudio/uni-app";
import { computed, onMounted, ref, watch } from "vue";

const store = useEventStore();
const subscribeStore = useSubscribeStore();
const userStore = useUserStore();
const notificationStore = useNotificationStore();
const CHIP_LIMIT = 6;
const expanded = ref(false);
const statusBarHeight = ref(uni.getWindowInfo?.()?.statusBarHeight ?? 44);
const navRightPadding = ref(16);

onMounted(() => {
  const metrics = getNavBarMetrics();
  statusBarHeight.value = metrics.statusBarHeight;
  navRightPadding.value = metrics.navRightPadding;
});

onLoad((options) => {
  const id = options?.id;
  const numId = Number(id);
  if (!id || id === "undefined" || !Number.isFinite(numId) || numId <= 0) {
    uni.showToast({ title: "活动ID缺失", icon: "none" });
    return;
  }
  // 不在此处 invalidateDetailCache：详情缓存有 3 分钟 TTL，本意就是覆盖
  // 「详情 → 返回 → 再进」的往返复用；每次进页都清掉会让命中率恒为 0，
  // 缓存只写不读，纯属浪费一次内存与一次 putBounded 淘汰开销。
  // 管理端改动最多延迟 3 分钟生效 —— 对活动类数据可接受。
  // 缓存内的动态字段已各自保证新鲜度：is_liked / likes_count 由
  // store.toggleLike 写回，subscribe_count 由 store.adjustSubscribeCount 就地修正。
  store.fetchDetail(numId);
  // 让已结束活动的“已订阅”判断准确（支持对已订阅的过期活动退订；含外部深链进入）
  if (userStore.isLoggedIn) {
    subscribeStore.fetchMySubscribedIds().catch(() => {});
  }
});

const ROLE_MAP: Record<string, string> = {
  PERFORMER: "演出",
  SPECIAL_GUEST: "嘉宾",
  HOST: "主持",
};

const d = computed(() => store.detail);

/** 海报缩略图：原图解码后动辄数 MB，详情页也不该下原图 */
const posterSrc = computed(() => posterThumb(d.value?.poster_url ?? ""));

// ---- 场次导航 ----
// 场次区以前是 swiper 轮播，swiper 必须写死高度，于是 .session-content 只能
// overflow-y:auto 把多出来的场次时间关在卡片内部，形成「卡片里再下拉一次」的
// 嵌套滚动。现在改为顶部横向导航 + 只渲染当前场次，卡片高度自适应内容。
const activeSessionIdx = ref(0);

/**
 * 各区块的展示上限。
 *
 * 这些字段来自运营配置，正常量级很小（场次 1~20、阵容 1~8），但**没有硬上限**：
 * 一旦后台配错数据（导入几百场次），这一页会直接撑爆、点都点不动。
 * 加切片是零成本的防御，超过部分给出提示而不是静默丢弃。
 */
const SESSIONS_MAX = 30;
const SESSION_TIMES_MAX = 20;
const ARTISTS_MAX = 12;

const visibleSessions = computed(() => (d.value?.sessions ?? []).slice(0, SESSIONS_MAX));

const currentSession = computed<EventSession | null>(() => {
  const list = d.value?.sessions ?? [];
  return list[activeSessionIdx.value] ?? null;
});

const visibleSessionTimes = computed(() => currentSession.value?.times?.slice(0, SESSION_TIMES_MAX) ?? []);

const visibleArtists = computed(() => (d.value?.artists ?? []).slice(0, ARTISTS_MAX));

function selectSession(idx: number) {
  activeSessionIdx.value = idx;
}

// 换活动（onLoad 里 fetchDetail 拉的是另一个 id）或场次数变化时，
// 把选中项夹回合法范围，否则 currentSession 会变成 null、整块内容消失。
watch(
  () => d.value?.id,
  () => {
    activeSessionIdx.value = 0;
  }
);
watch(
  () => (d.value?.sessions ?? []).length,
  (n) => {
    if (activeSessionIdx.value >= n) activeSessionIdx.value = 0;
  }
);

// ---- 艺人 chips ----
// 后端 artists 里可能混入空名条目（如脏数据 / 拆分演出场次产生的空行），
// 直接 v-for 会渲染出空白 chip，先过滤掉。
const validArtists = computed(() =>
  (d.value?.artists ?? []).filter((a) => !!a.artist_name)
);
// 展开前只显示前 CHIP_LIMIT 个
const displayedArtists = computed(() =>
  expanded.value ? validArtists.value : validArtists.value.slice(0, CHIP_LIMIT)
);
// 头像取第一个有效艺人，缺省走 getArtistAvatarSrc 内部的占位图
const firstArtistAvatar = computed(() => getArtistAvatarSrc(validArtists.value[0]));

// ---- 主题色 ----
// 必须取「未过滤」的 artists[0] 而不是 validArtists[0]：
// EventCard 也是按 artists[0] 取色的，两边口径要一致，
// 否则首个艺人 artist_name 为空的脏数据会让同一活动在两页显示不同颜色。
const theme = computed(() => {
  const a = (d.value?.artists ?? [])[0];
  return resolveArtistTheme(a?.theme_color, a?.artist_id);
});

// ---- 点赞 ----
const isLiked = computed(() => {
  const id = d.value?.id;
  return id ? (store.likedMap[id] ?? false) : false;
});
const likesCount = computed(() => {
  const id = d.value?.id;
  return id ? (store.likesCountMap[id] ?? 0) : 0;
});

async function onToggleLike() {
  const event = d.value;
  if (!event) return;
  userStore.requireLogin({
    dismissible: true,
    reason: "event_detail_like",
    onSuccess: () => {
      store.toggleLike(event.id).catch((e: unknown) => {
        uni.showToast({ title: (e as Error)?.message || "操作失败", icon: "none" });
      });
    },
  });
}

// ---- 订阅数 ----
// 直接读 store.detail.subscribe_count：订阅/退订时由 store.adjustSubscribeCount
// 就地修正，既驱动本页重渲染，也同步写入详情缓存（见该函数注释）。
// 早先用页面级 subscribeCountDelta 累加，那个 ref 随页面销毁而清零，
// 而缓存里的基线仍是订阅前的旧值 —— 3 分钟内二次进入本页会显示错误订阅数。
const subscribeCount = computed(() => d.value?.subscribe_count ?? 0);

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/**
 * 场次卡片标题。
 *
 * 用户认知里巡演的一场演出对应一个城市站，「场次 1 / 场次 2」只是数据库里的
 * 自增顺序，读者无从对应，因此优先展示站名：
 *   1. 后台填写的 session_name（「武汉站」「上海站」，含 Day 2 等自定义命名）
 *   2. 由城市名兜底拼「XX站」—— session_name 在后台可留空
 *   3. 都取不到才退回原来的「场次信息 / 场次 N」
 */
function sessionLabel(session: EventSession, idx: number, total: number): string {
  const named = session.session_name?.trim();
  if (named) return named;
  const city = formatCity(session.city);
  if (city) return `${city}站`;
  return total === 1 ? "场次信息" : `场次 ${idx + 1}`;
}

/** 场次坐标是否可用：未录入经纬度时判为未知，不能调起地图 */
function hasCoords(s: EventSession): boolean {
  return Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
    && s.latitude !== 0 && s.longitude !== 0;
}

/**
 * 跳场馆详情页。
 *
 * place_id 为空说明后台没给这个场次绑定场馆记录，此时跳转只会进到一个空页面，
 * 所以直接静默返回，并靠模板上不渲染箭头告诉用户「这里点不动」。
 */
function goPlace(session: EventSession) {
  if (!session.place_id) return;
  uni.navigateTo({ url: `/pages/place/detail?id=${encodeURIComponent(session.place_id)}` });
}

/**
 * 调起系统地图导航到场馆。
 *
 * 用 uni.openLocation 而非 uni.getLocation：前者只把目标坐标交给系统地图，
 * 不读取用户位置，因此无需定位权限、也不需要高德 key（见 utils/location.ts 的说明）。
 * name/address 传场馆信息，系统地图会用它做气泡标题与搜索词。
 */
function openMap(session: EventSession) {
  if (!hasCoords(session)) return;
  const cityName = formatCity(session.city);
  uni.openLocation({
    latitude: session.latitude,
    longitude: session.longitude,
    name: session.place_name || cityName || "演出场馆",
    address: [cityName, session.address].filter(Boolean).join(""),
    fail: () => {
      uni.showToast({ title: "未能打开地图，请稍后重试", icon: "none" });
    },
  });
}

/** 格式化场次时间：不带城市名（城市已在卡片标题显示） */
function formatSessionTime(t: { event_date: string; start_time?: string | null }) {
  const datePart = (t.event_date ?? "").split("T")[0];
  if (!datePart) return "";
  const [y, m, day] = datePart.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, day).getDay()];
  const time = t.start_time?.slice(0, 5) ?? "";
  return `${y}.${m}.${day} 周${weekday}${time ? " " + time : ""}`.trim();
}

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) {
    uni.navigateBack();
  } else {
    // 从推送通知直接打开时没有上一页，回到首页 tab
    switchTabPage("/pages/home/index");
  }
}

function goToArtist(artistId: string) {
  if (!artistId) return;
  uni.navigateTo({ url: `/pages/artist/detail?id=${artistId}` });
}

// ---- 购票 ----
// 名称与链接都非空才算一条可用入口：只渲染名称会让用户点到一个没反应的地方
const ticketList = computed(() =>
  (d.value?.tickets ?? []).filter((t) => !!t.name?.trim() && !!t.url?.trim())
);

function goTicket(t: { name: string; url: string }) {
  openExternalUrl(t.url, `购票链接（${t.name}）`);
}

// ---- 贡献者 ----
// 通过「上传情报」上报该演出、被运营核实采用的粉丝。
// 当前后端一个活动只可能有一个贡献者（convert 总是新建活动），
// 但接口按数组下发，将来支持把多条线索合并进同一活动时前端不用再改。
const contributors = computed(() =>
  (d.value?.contributors ?? []).filter((c) => !!c.nickname?.trim())
);
const contributorNames = computed(() =>
  contributors.value.map((c) => c.nickname.trim()).join("、")
);

// ── 订阅功能 ──
const isSubscribed = computed(() =>
  d.value ? subscribeStore.isEventSubscribed(d.value.id) : false
);

// ── 展示状态：按“今天”日期派生（PUBLISHED 且 end_date 已过 → ENDED）──
const effStatus = computed(() => (d.value ? effectiveEventStatus(d.value) : ""));
const statusPillText = computed(() => {
  if (!effStatus.value || effStatus.value === "PUBLISHED") return "";
  return (
    EVENT_STATUS_OPTIONS.find((o) => o.code === effStatus.value)?.label || effStatus.value
  );
});
const statusPillStyle = computed(
  () =>
    STATUS_BADGE_STYLE[effStatus.value] || {
      bg: "rgba(150,150,150,1)",
      fg: "#fff",
    }
);

/**
 * 订阅数的本地修正由 store.adjustSubscribeCount 承担（写 detail.value 即写透缓存）。
 * 页面这里只负责在切换成功后把 ±1 交给 store，无需再维护页面级增量。
 */
async function onToggleSubscribe() {
  const event = d.value;
  if (!event) return;

  // 已结束：未订阅则禁止再订阅；已订阅则维持原流程（点一次 = 退订）
  if (effStatus.value === "ENDED" && !isSubscribed.value) {
    uni.showToast({ title: "该活动已结束", icon: "none" });
    return;
  }

  userStore.requireLogin({
    dismissible: true,
    reason: "event_detail_subscribe",
    onSuccess: async () => {
      try {
        const nowSubscribed = await subscribeStore.toggleEvent(event.id);
        store.adjustSubscribeCount(event.id, nowSubscribed ? 1 : -1);
        // App 端：订阅成功后确保拿到系统通知权限并上报 cid
        if (nowSubscribed) {
          const granted = await notificationStore.requestSystemNotifyPermission();
          if (granted) {
            await syncPushToken();
          } else {
            uni.showToast({
              title: "已订阅，请到系统设置中允许通知",
              icon: "none",
              duration: 2500,
            });
          }
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

const typeLabel = computed(
  () => EVENT_TYPE_LABEL[d.value?.type ?? ""] ?? d.value?.type ?? ""
);

const noticeItems = computed(() => {
  const raw = d.value?.notice ?? "";
  return raw
    .split(/\n(?=•)/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").filter(Boolean);
      return {
        title: lines[0]?.replace(/^•\s*/, "") ?? "",
        body: lines.slice(1).join("\n"),
      };
    });
});

/**
 * 当前须知是否为「通用提示」而非主办方公告。
 *
 * store 在后台未配置 notice 时会填入 GENERIC_AUDIENCE_NOTICE（见 stores/event.ts）。
 * 内容本身是全行业通用规则，但用主办方的口吻展示会让用户误以为是官方公告，
 * 因此这里要显式标注来源。
 */
const noticeIsGeneric = computed(
  () => !!d.value?.notice && d.value.notice === GENERIC_AUDIENCE_NOTICE,
);
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 60rpx;
}

/* ── NavBar ── */
.navbar {
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 100;
}
.navbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88rpx;
  padding: 0 32rpx;
}
.nav-back {
  display: flex;
  align-items: center;
  gap: 4rpx;
}
.nav-back-label {
  font-size: 32rpx;
  color: #333;
  font-weight: 500;
}
.nav-actions {
  display: flex;
  gap: 28rpx;
}
.nav-icon {
  font-size: 36rpx;
}
.nav-subscribe-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: #f8f8f8;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.nav-subscribe-btn--hover {
  opacity: 0.7;
}
.nav-subscribe-icon {
  width: 90%;
  height: 90%;
}

/* ── 信息卡片（底色由内联 theme.base 覆盖，见模板）── */
.card {
  margin: 60rpx 24rpx 0;
  background: #e4e5e9;
  border-radius: 24rpx;
  padding-bottom: 28rpx;
  position: relative;
  padding-top: 64rpx;
  /* 用 box-shadow 模拟设计稿的"白色外框 + 轻微阴影"：
     spread 8rpx 的白色阴影形成白色描边效果，再叠一层灰色阴影做浮起感。 */
  box-shadow: 0 0 0 6rpx #fff, 0 6rpx 20rpx rgba(0, 0, 0, 0.08);
}
.avatar-wrap {
  position: absolute;
  top: -48rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  overflow: hidden;
  border: 4rpx solid #fff;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.1);
}
.avatar {
  width: 100%;
  height: 100%;
}
.card-body {
  padding: 0 28rpx;
}
.title-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx 28rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}
.event-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #1a1a1a;
  display: block;
  line-height: 1.4;
}
.event-status-pill {
  display: inline-flex;
  align-self: flex-start;
  border-radius: 20rpx;
  padding: 4rpx 18rpx;
  margin-bottom: 12rpx;
}
.event-status-pill-text {
  font-size: 20rpx;
  color: #fff;
  font-weight: 500;
  letter-spacing: 1rpx;
}

/* Chips */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 10rpx;
}
.chip {
  background: #fff;
  border-radius: 32rpx;
  padding: 6rpx 22rpx;
  font-size: 24rpx;
  color: #333;
}
.chip--pending {
  color: #999;
  font-style: italic;
}
.see-all {
  text-align: center;
  padding: 8rpx 0 4rpx;
}
.see-all-text {
  font-size: 24rpx;
  /* 底色已改为浅色主题底，白字不可读；实际颜色由内联 theme.ink 覆盖 */
  color: #333;
}

/* 统计项（收藏数 / 点赞数） */
.card-stat {
  display: flex;
  align-items: center;
  gap: 6rpx;
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 24rpx;
  padding: 10rpx 16rpx;
}
.card-stat-icon {
  width: 28rpx;
  height: 28rpx;
  flex-shrink: 0;
}
.card-stat-val {
  font-size: 22rpx;
  color: #333;
  line-height: 1.3;
  flex: 1;
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
.card-stat-val--liked {
  color: #fea500;
  font-weight: 600;
}
.card-stat--clickable {
    cursor: pointer;
  }
  .card-stat--hover {
    opacity: 0.6;
  }
  /* 已订阅：胶囊底色微染 + 数字高亮，与导航栏订阅态保持一致 */
  .card-stat--subscribed {
    background: rgba(254, 165, 0, 0.08);
  }
  .card-stat-val--active {
    color: #fea500;
    font-weight: 600;
  }

  /* 卡片内上传用户行（单独占一行） */
  .card-organizer-row {
    display: flex;
    align-items: center;
    gap: 8rpx;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 24rpx;
    padding: 10rpx 16rpx;
    margin-top: 16rpx;
    margin-bottom: 12rpx;
  }

  /* 卡片内活动类型行：活动类型 / 订阅数 / 点赞数 三个独立胶囊并排 */
  .card-type-row {
    display: flex;
    align-items: center;
    gap: 12rpx;
  }
  /* 活动类型自身也是一个独立胶囊，与订阅/点赞同规格 */
  .card-type-item {
    display: flex;
    align-items: center;
    gap: 8rpx;
    flex: 1;
    min-width: 0;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 24rpx;
    padding: 10rpx 16rpx;
  }
  .card-type-icon {
    width: 28rpx;
    height: 28rpx;
    flex-shrink: 0;
  }
  .card-type-text {
    font-size: 22rpx;
    color: #333;
    line-height: 1.3;
  }
  .card-type-text--ellipsis {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* 贡献者行：与上面的活动类型胶囊同规格，说明「这条信息是谁提供的」。
     昵称用主题色，既能和品牌胶囊区分开，又和艺人名的高亮方式一致。 */
  .card-contributor-row {
    display: flex;
    align-items: center;
    gap: 8rpx;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 24rpx;
    padding: 10rpx 16rpx;
    margin-top: 12rpx;
  }
  .card-contributor-label {
    font-size: 22rpx;
    color: #999;
    line-height: 1.3;
    flex-shrink: 0;
  }
  .card-contributor-name {
    flex: 1;
    min-width: 0;
    font-size: 22rpx;
    font-weight: 600;
    color: #f5a623;
    line-height: 1.3;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

.divider {
  height: 1rpx;
  background: rgba(0, 0, 0, 0.08);
  margin: 20rpx 0;
}

/* ── 统计信息卡片 ── */
.stats-section {
  background: #fff;
  margin: 20rpx 24rpx 0;
  border-radius: 24rpx;
  padding: 28rpx 32rpx;
  border: 1rpx solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.1);
}

/* 统计行 */
.stats-row {
  display: flex;
  gap: 24rpx;
  margin-bottom: 24rpx;
}
.stat {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex: 1;
  min-width: 0;
  background: #f5f5f5;
  border-radius: 32rpx;
  padding: 12rpx 20rpx;
}
.sico-img {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
}
.sval {
  font-size: 24rpx;
  color: #333;
  line-height: 1.3;
  flex: 1;
  min-width: 0;
  /* 短内容（数字）单行；长内容（组织者名）允许 2 行后省略 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
.sval--liked {
  color: #fea500;
  font-weight: 600;
}
.stat--clickable {
  cursor: pointer;
}

/* ── 场次容器 ── */
.sessions-section {
  margin: 20rpx 24rpx 0;
  padding: 0 4rpx; /* 给阴影留出空间 */
}

/* ── 场次导航条（仅多场次时出现） ── */
.session-tabs-scroll {
  width: 100%;
  margin-bottom: 16rpx;
}
.session-tabs {
  display: flex;
  gap: 16rpx;
  padding: 4rpx 4rpx 8rpx;
  white-space: nowrap;
}
.session-tab {
  flex-shrink: 0;
  padding: 12rpx 28rpx;
  border-radius: 32rpx;
  background: #f2f3f5;
  border: 1rpx solid transparent;
}
.session-tab--active {
  /* 底色与描边由内联 theme 覆盖，见模板 */
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
}
.session-tab-text {
  font-size: 26rpx;
  font-weight: 500;
  color: #6b6b6b;
}
.session-tab--active .session-tab-text {
  font-size: 26rpx;
  font-weight: 600;
  /* 实际颜色由内联 theme.ink 覆盖 */
  color: #333;
}

/* ── 单个场次卡片 ── */
.session-card {
  /* 高度跟着内容走：场次时间再多也只是把页面撑长，不会关出内部滚动条 */
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
  border-radius: 28rpx;
  /* border: 2rpx solid rgba(254, 165, 0, 0.15); */
  /* box-shadow: 0 8rpx 24rpx rgba(254, 165, 0, 0.12), 0 2rpx 8rpx rgba(0, 0, 0, 0.08); */
  overflow: visible;
}

/* ── 场次头部 ── */
/* 底色由内联 withAlpha(theme.ink, ...) 覆盖（见模板）：
   用「淡墨色」而非 theme.base，是为了跟下方白色的 .session-content 拉开层次——
   两者都是浅色，直接都用 base 会糊成一片。 */
.session-header {
  background: rgba(0, 0, 0, 0.06);
  padding: 20rpx 32rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 28rpx 28rpx 0 0; /* 只圆化顶部两个角 */
}

.session-badge {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.55);
  border-radius: 24rpx;
  padding: 8rpx 20rpx;
  backdrop-filter: blur(10rpx);
}

.session-badge-text {
  font-size: 26rpx;
  font-weight: 600;
  /* 底色已改为浅色主题底，白字不可读；实际颜色由内联 theme.ink 覆盖 */
  color: #333;
  letter-spacing: 1rpx;
}

.session-count {
  display: flex;
  align-items: center;
}

.session-count-text {
  font-size: 24rpx;
  /* 同上，实际颜色由内联 theme.ink 覆盖 */
  color: #333;
  font-weight: 500;
}

/* ── 场次内容区 ── */
.session-content {
  padding: 20rpx;
}

/* ── 详情行（带图标） ── */
.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  margin-bottom: 24rpx;
  padding: 16rpx 20rpx;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 16rpx;
  /* --ti 由 .session-content 上的内联主题色注入，见模板 */
  border: 1rpx solid var(--ti-soft, rgba(0, 0, 0, 0.07));
}

.detail-row:last-child {
  margin-bottom: 0;
}

.detail-row--times {
  align-items: flex-start;
}

.detail-icon-wrap {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  /* 原为橙色渐变；改为墨色单层，色相跟随艺人主题 */
  background: var(--ti, rgba(0, 0, 0, 0.12));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dico-img {
  width: 24rpx;
  height: 24rpx;
}

.dtxt {
  font-size: 28rpx;
  color: #333;
  line-height: 1.6;
  flex: 1;
}

.dtxt-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  flex: 1;
}

.dtxt-list-item {
  font-size: 28rpx;
  color: #333;
  line-height: 1.6;
  padding: 8rpx 0;
  border-bottom: 1rpx dashed rgba(0, 0, 0, 0.08);
}

.dtxt-list-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

/* ── 信息 / 统计 / 地址 白色卡片 ── */
.info-section {
  background: #fff;
  margin: 20rpx 24rpx 0;
  border-radius: 24rpx;
  padding: 28rpx 32rpx;
  border: 1rpx solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.1);
}

/* 三列信息行 */
.info-row {
  display: flex;
  gap: 24rpx;
  margin-bottom: 24rpx;
}
.info-cell {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex: 1;
  min-width: 0;
  background: #f5f5f5;
  border-radius: 32rpx;
  padding: 12rpx 20rpx;
}
/* 日期 cell 比另外两个稍宽一点，容纳 "8-8 周六 19:00" 单行 */
.info-cell--date {
  flex: 1.4;
}
/* 单行 + ellipsis 的文本样式，覆盖 .itxt 默认的 2 行 line-clamp */
.itxt--single {
  display: block;
  -webkit-line-clamp: unset;
  -webkit-box-orient: unset;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 22rpx;
}
.iico-img {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
}
.itxt {
  font-size: 26rpx;
  color: #333;
  line-height: 1.4;
  flex: 1;
  min-width: 0;
  /* 短内容单行显示，长内容最多 2 行后省略，避免 "北京..." 这类硬截断 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

/* 单行详情（时间 / 地址 / 场馆）：图标 + 文字 */
.detail-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 18rpx;
  background: #f5f5f5;
  border-radius: 32rpx;
  padding: 14rpx 20rpx;
}
/* 多条时间时图标对齐顶部 */
.detail-row--times {
  align-items: flex-start;
}
/* 多条时间垂直排列 */
.dtxt-list {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.dtxt-list-item {
  font-size: 26rpx;
  color: #333;
  line-height: 1.5;
}
.detail-row:last-of-type {
  margin-bottom: 0;
}
.dico-img {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
}
.dtxt {
  font-size: 26rpx;
  color: #333;
  flex: 1;
  line-height: 1.4;
  min-width: 0;
  /* 地址/场馆长文本允许 2 行后省略，避免 "北京市海淀..." 硬截断 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
/* 可点击行（跳场馆详情 / 调起地图）的按压反馈，与购票行的 hover 一致 */
.detail-row-hover {
  background: #ebebeb;
}
/* 行尾箭头：仅在真的有 place_id / 经纬度时渲染，靠它表达「这行能点」 */
.dtxt-arrow {
  font-size: 32rpx;
  color: #bbb;
  flex-shrink: 0;
  line-height: 1;
}

/* ── Section ── */
.section {
  background: #fff;
  margin-top: 20rpx;
  padding: 32rpx 28rpx;
  /* flex column 让直接子元素每个独占一行；
     align-items: flex-start 让子元素不强制 stretch 到 100% 宽，
     这样 .notice-title-wrap 这种"宽度跟随文字"的容器才能 shrink-to-fit。 */
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #1a1a1a;
  display: block;
  margin-bottom: 20rpx;
}
.event-description {
  display: block;
  width: 100%;
  font-size: 28rpx;
  color: #333;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.poster {
  width: 100%;
  border-radius: 16rpx;
}

/* 观演须知 / 演出阵容 / 演出介绍 */
.notice-title-wrap {
  position: relative;
  /* 跟随文字宽度：让内部 .notice-title-bar 的 left/right 锚定到文字宽度而非整行 */
  display: inline-flex;
  align-items: center;
  margin-bottom: 24rpx;
}
.notice-title-bar {
  position: absolute;
  bottom: 0;
  left: -4rpx;
  right: -4rpx;
  height: 45%;
  background: #f5a623;
  border-radius: 10rpx;
  z-index: 0;
}
.notice-section-title {
  position: relative;
  z-index: 1;
  margin-bottom: 0 !important;
}
.notice-box {
  width: 100%;
  border: 2rpx solid #e8e8e8;
  border-radius: 16rpx;
  padding: 24rpx 28rpx;
  box-sizing: border-box;
}
.notice-source-tip {
  margin-top: 12rpx;
  padding: 16rpx 24rpx;
  border-radius: 12rpx;
  background: #f6f7f8;
  color: #8a8f99;
  font-size: 24rpx;
  line-height: 1.6;
}
.notice-item {
  margin-bottom: 24rpx;
}
.notice-item:last-child {
  margin-bottom: 0;
}
.notice-head {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 6rpx;
}
.notice-bullet {
  font-size: 28rpx;
  color: #1a1a1a;
}
.notice-title {
  font-size: 26rpx;
  font-weight: bold;
  color: #1a1a1a;
}
.notice-body {
  font-size: 24rpx;
  color: #666;
  line-height: 1.6;
  padding-left: 20rpx;
  display: block;
}

/* ── 购票 ── */
.ticket-list {
  width: 100%;
  border: 2rpx solid #e8e8e8;
  border-radius: 16rpx;
  overflow: hidden;
}
.ticket-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 28rpx;
  border-bottom: 2rpx solid #f0f0f0;
}
.ticket-item:last-child {
  border-bottom: none;
}
.ticket-item-hover {
  background: #f7f7f7;
}
.ticket-name {
  font-size: 28rpx;
  color: #1a1a1a;
  font-weight: 500;
}
.ticket-arrow {
  font-size: 32rpx;
  color: #bbb;
}

/* ── 演出阵容 ── */
.artist-scroll {
  width: 100%;
}
.artist-list {
  display: flex;
  gap: 24rpx;
  padding: 4rpx 4rpx 12rpx;
  white-space: nowrap;
}
.artist-card {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  width: 120rpx;
}
.artist-avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: #f0f0f0;
}
.artist-name {
  font-size: 22rpx;
  color: #1a1a1a;
  margin-top: 10rpx;
  text-align: center;
  max-width: 120rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artist-role {
  font-size: 20rpx;
  color: #e86c8a;
  margin-top: 4rpx;
}

.empty {
  text-align: center;
  padding: 120rpx 0;
  color: #aaa;
  font-size: 28rpx;
}

/* ── 骨架屏 ── */
@keyframes sk-shimmer {
  0% {
    background-position: -400rpx 0;
  }
  100% {
    background-position: 400rpx 0;
  }
}
.sk-card {
  margin: 60rpx 24rpx 0;
  background: #fff;
  border-radius: 24rpx;
  padding: 80rpx 28rpx 28rpx;
  position: relative;
}
.sk-section {
  background: #fff;
  margin-top: 20rpx;
  padding: 32rpx 28rpx;
}
.sk-avatar {
  position: absolute;
  top: -48rpx;
  left: 50%;
  transform: translateX(-50%);
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: #e8e8e8;
}
.sk-line,
.sk-chip,
.sk-cell,
.sk-artist,
.sk-poster {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 400rpx 100%;
  animation: sk-shimmer 1.4s infinite linear;
  border-radius: 8rpx;
}
.sk-title {
  height: 40rpx;
  width: 80%;
  margin-bottom: 24rpx;
}
.sk-short {
  height: 24rpx;
  width: 40%;
  margin: 16rpx 0;
}
.sk-half {
  height: 32rpx;
  width: 50%;
  margin-bottom: 20rpx;
}
.sk-chips {
  display: flex;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.sk-chip {
  height: 44rpx;
  width: 120rpx;
  border-radius: 32rpx;
}
.sk-chip-sm {
  width: 80rpx;
}
.sk-row {
  display: flex;
  gap: 12rpx;
}
.sk-cell {
  flex: 1;
  height: 60rpx;
  border-radius: 32rpx;
}
.sk-artist-row {
  display: flex;
  gap: 24rpx;
}
.sk-artist {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  flex-shrink: 0;
}
.sk-poster {
  width: 100%;
  height: 320rpx;
  border-radius: 16rpx;
}
</style>
