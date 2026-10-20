// 本地搜索历史。
//
// 约定与 utils/storage.ts 一致：私有 KEY 常量 + fans: 前缀 + get/set/clear 三件套导出。
// 但独立成文件而不是塞进 storage.ts —— 那里全是「单标量 + 一个 key」，
// 搜索历史是「有序去重的数组」，混进去会把两种读写模型搅在一起。
//
// 用数组单 key 存，而不是 utils/place/detail.vue 书签那种「一个 id 一个 key」：
// 关键词去重、置顶、截断都需要遍历同一份数据，散成多个 key 只能靠
// getStorageInfoSync() 全量扫键重建，代价高且没有天然的顺序保证。

const KEY_SEARCH_HISTORY = "fans:search:history";

/**
 * 历史条数上限。
 *
 * 不设上限的话，长时间使用会让这个 key 无限膨胀（uni storage 没有自动清理），
 * 而历史本身对用户只有「最近几条」有价值，翻到第 30 条基本不会有人用。
 */
export const SEARCH_HISTORY_MAX = 10;

export interface SearchHistoryItem {
  /** 原始关键词，展示与回填都用它 */
  q: string;
  /** 写入时间戳（ms），仅用于将来做按时间分组，目前不参与展示 */
  at: number;
}

/**
 * storage 里的数据不可信：可能来自旧版本结构、手工改过、或被别的代码写坏。
 * 这里逐项校验形状，坏数据直接丢弃而不是让调用方拿到 undefined 上再炸。
 */
function readRaw(): SearchHistoryItem[] {
  try {
    const raw = uni.getStorageSync(KEY_SEARCH_HISTORY);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (it): it is SearchHistoryItem =>
          !!it && typeof it === "object" && typeof (it as SearchHistoryItem).q === "string",
      )
      .map((it) => ({ q: it.q, at: typeof it.at === "number" ? it.at : 0 }));
  } catch {
    // storage 不可用（隐私模式等）时按「无历史」处理，不能让搜索页直接崩
    return [];
  }
}

function writeRaw(list: SearchHistoryItem[]): void {
  try {
    uni.setStorageSync(KEY_SEARCH_HISTORY, list);
  } catch {
    // 写失败（配额满）时静默降级：搜索本身不受影响，只是历史不更新
  }
}

/** 按小写比较，避免 "YOASOBI" 和 "yoasobi" 在历史里各占一行 */
function sameKeyword(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** 读取历史，按写入时间倒序（最新在前） */
export function getSearchHistory(): SearchHistoryItem[] {
  return readRaw().sort((a, b) => b.at - a.at).slice(0, SEARCH_HISTORY_MAX);
}

/**
 * 记录一次搜索：同关键词去重并置顶，超过上限丢最旧的。
 *
 * 只应在「用户确实发起了一次搜索」时调用（回车 / 点进某条结果），
 * 不能挂在输入防抖上 —— 否则 "Y"、"YO"、"YOA" 每个中间态都会进历史。
 */
export function addSearchHistory(keyword: string): void {
  const q = keyword.trim();
  if (!q) return;
  const next = [{ q, at: Date.now() }, ...readRaw().filter((it) => !sameKeyword(it.q, q))];
  writeRaw(next.slice(0, SEARCH_HISTORY_MAX));
}

/** 删除单条 */
export function removeSearchHistory(keyword: string): void {
  writeRaw(readRaw().filter((it) => !sameKeyword(it.q, keyword)));
}

/** 清空全部历史 */
export function clearSearchHistory(): void {
  try {
    uni.removeStorageSync(KEY_SEARCH_HISTORY);
  } catch {
    // 同上，清不掉就当没历史，不阻断交互
  }
}
