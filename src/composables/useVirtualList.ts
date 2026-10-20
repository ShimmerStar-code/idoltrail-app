// composable：长列表窗口化渲染（虚拟滚动）
//
// ── 为什么需要 ──────────────────────────────────────────────
// 无限分页列表只做 concat，滚到底加载第 N 页后全部节点都留在 DOM 里。
// 一张 EventSubCard 展开后有 20+ 个节点，加载 5 页（100 条）就是 2000+ 节点，
// 低端机滚动帧率和进页首帧都会明显掉。
//
// ── 什么时候不能用 ──────────────────────────────────────────
// 只适用于 **scroll-view** 容器（需要自己掌控滚动位置与占位高度）。
// 用原生页面滚动（onReachBottom / onPageScroll）的列表不能用，
// 因为往视口上方插入/移除占位节点无法避免滚动跳变，uni-app 也不提供页面级 scrollTop 回写。
// 本项目 pages/artist/by-country.vue 属于后者；
// pages/event/list.vue 已改为固定高度 scroll-view，可以使用。
//
// ── 防滚动跳变的关键不变量 ──────────────────────────────────
// 「位于 start 之前（即视口上方）的项，高度一定是实测值而非估算值」。
// 成立的原因：start 只增不减，滑出视口上方的项在滑出之前必然已被渲染过、测过。
// 因此所有高度修正都发生在视口上方的位置 → 不影响用户当前看到的画面，
// 也就不会出现「列表突然往上跳一截」。
//
// 前置要求：列表项里的图片必须有确定尺寸（固定宽高或固定宽高比容器）。
// 若图片高宽未知，加载完成前后高度会变，修正点就会落到视口内导致跳动。

import { computed, getCurrentInstance, nextTick, onUnmounted, ref, watch, type Ref } from "vue";

export interface VirtualListOptions<T> {
  /** 列表数据源 */
  source: Ref<T[]>;
  /** 稳定唯一 key：高度缓存与 v-for :key 都依赖它。不能直接用数组下标，
   *  否则首屏窗口右移时所有项的缓存高度会整体错位。 */
  getKey: (item: T, index: number) => string | number;
  /** 测量用的选择器，必须能选中**每一个列表项的根节点** */
  itemSelector: string;
  /** 未实测前的估算高度（px）。实测后会逐项替换。 */
  estimatedHeight?: number;
  /** 视口上下各额外渲染的项数，避免快速滚动时露白 */
  overscan?: number;
  /** 视口高度（px）；不传则退回系统窗口高度 */
  viewportHeight?: number;
}

/** 在升序数组里找第一个 >= target 的下标（找不到返回 n） */
function lowerBound(arr: number[], target: number, n: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function useVirtualList<T>(options: VirtualListOptions<T>) {
  const {
    source,
    getKey,
    itemSelector,
    estimatedHeight = 120,
    overscan = 3,
  } = options;

  const instance = getCurrentInstance();

  const scrollTop = ref(0);
  const viewport = ref(
    options.viewportHeight ?? (uni.getWindowInfo?.()?.windowHeight ?? 800),
  );

  /** key → 实测高度。
   *  翻页会让它单调增长，加容量上限：超出后丢最早写入的一半。
   *  Map 的插入序即写入序，丢掉的只会是视口最上方那批（早被划走），
   *  它们再滚回去时退回估算高度重测一次即可，不影响正确性。 */
  const HEIGHTS_MAX = 600;
  const heights = new Map<string | number, number>();
  /** heights 是普通 Map，computed 读不到它的变化，用 version 做触发器 */
  const version = ref(0);

  /** 写入实测高度并按需淘汰，避免 heights 无限增长 */
  function setHeight(key: string | number, h: number) {
    heights.set(key, h);
    if (heights.size > HEIGHTS_MAX) {
      const drop = Math.floor(HEIGHTS_MAX / 2);
      let i = 0;
      for (const k of heights.keys()) {
        heights.delete(k);
        if (++i >= drop) break;
      }
    }
  }

  let measuring = false;
  let pendingMeasure = false;
  let passes = 0;
  /** 滚动停止计时器：滚动期间不测量，停下来后再补测一轮 */
  let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null;
  /** 上次真正发起过 DOM 测量的滚动位置，用于跳过无意义的位置 */
  let lastMeasuredTop = -1;

  /** offsets[i] = 第 i 项的顶部；offsets[n] = 总高度 */
  const offsets = computed<number[]>(() => {
    void version.value; // heights 是普通 Map，读它建立不了依赖，靠 version 触发重算
    const arr = source.value;
    const out = new Array<number>(arr.length + 1);
    out[0] = 0;
    for (let i = 0; i < arr.length; i++) {
      out[i + 1] = out[i] + (heights.get(getKey(arr[i], i)) ?? estimatedHeight);
    }
    return out;
  });

  const totalHeight = computed(() => offsets.value[source.value.length] ?? 0);

  const range = computed(() => {
    const arr = source.value;
    const n = arr.length;
    if (n === 0) return { start: 0, end: 0 };
    const off = offsets.value;
    const vh = viewport.value || 800;
    const overPx = overscan * estimatedHeight;
    const top = Math.max(0, scrollTop.value - overPx);
    const bottom = scrollTop.value + vh + overPx;
    let start = lowerBound(off, top, n);
    // 数据变短（删除筛选结果、整页被移除）而 scrollTop 还停在旧位置时，
    // start 会等于 n → 一个节点都不渲染 → 整屏空白。兜底至少留住最后一项。
    if (start > n - 1) start = n - 1;
    let end = lowerBound(off, bottom, n) + 1;
    if (end < start + 1) end = start + 1;
    if (end > n) end = n;
    return { start, end };
  });

  /** 渲染窗口内的项 */
  const visibleItems = computed(() => {
    const arr = source.value;
    const { start, end } = range.value;
    const out: Array<{ item: T; index: number; key: string | number }> = [];
    for (let i = start; i < end; i++) {
      out.push({ item: arr[i], index: i, key: getKey(arr[i], i) });
    }
    return out;
  });

  const topSpacer = computed(() => offsets.value[range.value.start] ?? 0);
  const bottomSpacer = computed(() => {
    const n = source.value.length;
    const off = offsets.value;
    const end = Math.min(range.value.end, n);
    return Math.max(0, (off[n] ?? 0) - (off[end] ?? 0));
  });

  /** 距底部还剩多少可滚动距离（px），已触底为 0。
   *
   *  用途是**提前预取**：不等 scrolltolower（那要等滚到底），而是剩不到 N 屏时就拉下一页。
   *  提前触发不会造成跳变 —— 新项只插在视口下方，视口上方的高度早已是实测值，
   *  用户看到的是内容在下方生长，而不是被顶走。
   *
   *  注意它是「估算高度」算出来的：尚未实测的项按 estimatedHeight 计，
   *  所以只是个启发式阈值，不适合当精确值用。 */
  const distanceToEnd = computed(() =>
    Math.max(0, totalHeight.value - scrollTop.value - viewport.value),
  );

  /** 手动指定视口高度（如页面自己算过 scroll-view 的高度） */
  function setViewportHeight(h: number) {
    if (h > 0 && h !== viewport.value) viewport.value = h;
  }

  /** 清空高度缓存：筛选条件整体切换、卡片结构变化时调用 */
  function reset() {
    heights.clear();
    version.value++;
    scrollTop.value = 0;
    passes = 0;
    lastMeasuredTop = -1;
    // 清完缓存所有项都退回估算高度，必须主动重测一轮，否则占位块一直是估值
    scheduleMeasure();
  }

  /** 强制重新测量（如展开/收起导致卡片高度变化） */
  function refresh() {
    passes = 0;
    lastMeasuredTop = -1;
    scheduleMeasure();
  }

  function onScroll(e: { detail?: { scrollTop?: number } }) {
    const t = e?.detail?.scrollTop;
    if (typeof t === "number" && t !== scrollTop.value) {
      scrollTop.value = t;
      // 滚动期间**不测量**。measureNow 会走 uni.createSelectorQuery，
      // 在 App 端是 webview → 原生的 JSBridge 往返：原生侧要等当前布局帧结束才能量，
      // 回包又要等一个事件循环。滚动事件按帧派发（60~120 次/秒），
      // 无条件挂上去等于每帧一次强制布局，正是滑动掉帧的直接来源。
      // 这里只重算渲染窗口（纯 JS 运算，几十微秒），测量交给滚动停止后那一轮。
      scheduleMeasureAfterScrollIdle();
    }
  }

  /**
   * 滚动停止后再测量。
   * 120ms 是与原生惯性滚动惯用的间隔：短于它会在滑行途中被反复重置、永不触发；
   * 长于它则多等一段无意义的空窗。
   */
  function scheduleMeasureAfterScrollIdle() {
    if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => {
      scrollIdleTimer = null;
      // 停下来的位置与上次测量的位置一致时，说明期间没有新项进入窗口，测了也是白测
      if (scrollTop.value === lastMeasuredTop) return;
      scheduleMeasure();
    }, 120);
  }

  function scheduleMeasure() {
    if (measuring) {
      pendingMeasure = true;
      return;
    }
    void nextTick().then(() => {
      setTimeout(measureNow, 0);
    });
  }

  function measureNow() {
    if (!instance) return;
    const items = visibleItems.value;
    if (items.length === 0) return;
    lastMeasuredTop = scrollTop.value;
    // 高度修正会改变偏移表 → 触发重渲染 → 又要测量。单次滚动最多允许 3 轮，
    // 防止内容一直微调导致死循环。
    if (passes >= 3) {
      // ⚠️ 这里必须把 passes 归零：否则它在 3 上停住后，
      // 后续每一次 measureNow 都会从这个分支直接返回，测量能力永久失效。
      passes = 0;
      measuring = false;
      pendingMeasure = false;
      return;
    }
    measuring = true;
    passes++;

    uni
      .createSelectorQuery()
      .in(instance.proxy)
      .selectAll(itemSelector)
      .boundingClientRect((rects: unknown) => {
        const list = rects as Array<{ height?: number }> | null;
        // 数量对不上说明本次查询跨越了一次数据变更，丢弃这批结果
        if (Array.isArray(list) && list.length === items.length) {
          let changed = false;
          for (let i = 0; i < list.length; i++) {
            const h = list[i]?.height;
            if (!h || h <= 0) continue;
            if (heights.get(items[i].key) !== h) {
              setHeight(items[i].key, h);
              changed = true;
            }
          }
          if (changed) version.value++;
        }
        measuring = false;
        if (pendingMeasure) {
          pendingMeasure = false;
          scheduleMeasure();
        } else {
          passes = 0;
        }
      })
      .exec();
  }

  // 数据变化后补测：新挂载的项还没高度，先用估算值撑开
  watch(
    () => source.value.length,
    () => {
      passes = 0;
      // 新项没有实测高度，必须无条件重测，不能被 lastMeasuredTop 的去重跳过
      lastMeasuredTop = -1;
      scheduleMeasure();
    },
  );

  // 组件销毁时清掉待触发的滚动停止计时器，避免离页后仍回调进已销毁的实例
  onUnmounted(() => {
    if (scrollIdleTimer) {
      clearTimeout(scrollIdleTimer);
      scrollIdleTimer = null;
    }
  });

  return {
    visibleItems,
    topSpacer,
    bottomSpacer,
    totalHeight,
    distanceToEnd,
    onScroll,
    setViewportHeight,
    reset,
    refresh,
  };
}