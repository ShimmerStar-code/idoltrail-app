/**
 * artistTheme 艺人主题色
 * ─────────────────────────────────────────────
 * 「一位艺人一个主题色」：活动卡片、艺人详情页、活动详情页、场馆页等
 * 凡是展示该艺人活动的位置，都取同一个色。
 *
 * 取色优先级：
 *   1. 后端 artists.theme_color（运营在后台 Web 配置，#RRGGBB）
 *   2. 预设浅色板中精确匹配同一个 base（后台选的就是板里的色，
 *      直接命中配套 ink，保证「后台所见 = App 所得」）
 *   3. theme_color 是板外的任意 hex（外部直接调 API 写入）→ 用 HSL
 *      推导出浅底 + 深墨，保证仍是浅色系且文字可读
 *   4. 没有 theme_color → 按 artist_id 哈希取板内某色，稳定不飘
 *   5. 连艺人都没有（无艺人的活动）→ 中性灰，不参与分配
 *
 * 后端约定：artists.theme_color 允许 NULL / 空串，含义是「未配置」。
 * 对应 migration 0049_add_artist_theme_color、internal/model/theme_color.go。
 *
 * ⚠ 与 idoltrail-admin-web/src/constants/artistTheme.ts 的 PRESET_PALETTE
 *   保持同步（admin 端只能从这组色里选）。
 */

export interface ArtistTheme {
  /** 浅色背景（卡片色块底色） */
  base: string;
  /** 浅底上的深色前景（艺人名文字、图标） */
  ink: string;
  /** 色板名称，仅用于调试与后台展示 */
  name: string;
}

/** 预设浅色板：低饱和、高明度，长列表不刺眼，浅底深字对比度充足 */
export const ARTIST_THEME_PALETTE: readonly ArtistTheme[] = [
  { name: "樱花粉", base: "#F8C8DC", ink: "#A63D62" },
  { name: "蜜桃橙", base: "#FFD9C0", ink: "#B35A24" },
  { name: "奶油黄", base: "#FCE8A8", ink: "#96731A" },
  { name: "柠檬绿", base: "#DFF0C0", ink: "#5C7A26" },
  { name: "薄荷绿", base: "#C7EBD8", ink: "#237A54" },
  { name: "湖水青", base: "#BFE6E4", ink: "#1C7177" },
  { name: "天青蓝", base: "#C3DFF2", ink: "#2A6699" },
  { name: "雾霾蓝", base: "#C8D2EC", ink: "#41539B" },
  { name: "薰衣草", base: "#DCD0F0", ink: "#6247A0" },
  { name: "丁香紫", base: "#EBD4EE", ink: "#84408F" },
  { name: "藕荷粉", base: "#F5CFE0", ink: "#A84372" },
  { name: "燕麦米", base: "#EDE3D4", ink: "#7A6042" },
];

/** 无艺人时的中性色，不参与哈希分配，避免暗示某个艺人的身份色 */
export const NEUTRAL_ARTIST_THEME: ArtistTheme = {
  name: "中性灰",
  base: "#E4E5E9",
  ink: "#5A5F6B",
};

// ── 颜色工具 ───────────────────────────────────────────────────────────────

/** #RGB → #RRGGBB；非法的补 # */
export function normalizeHex(input?: string | null): string | null {
  if (!input) return null;
  let s = String(input).trim();
  if (!s) return null;
  if (!s.startsWith("#")) s = `#${s}`;
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return null;
  if (s.length === 4) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    s = `#${r}${r}${g}${g}${b}${b}`;
  }
  return s.toUpperCase();
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): Hsl | null {
  const norm = normalizeHex(hex);
  if (!norm) return null;
  const r = parseInt(norm.slice(1, 3), 16) / 255;
  const g = parseInt(norm.slice(3, 5), 16) / 255;
  const b = parseInt(norm.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.min(100, Math.max(0, s)) / 100;
  const ll = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) [rp, gp, bp] = [c, x, 0];
  else if (hh < 120) [rp, gp, bp] = [x, c, 0];
  else if (hh < 180) [rp, gp, bp] = [0, c, x];
  else if (hh < 240) [rp, gp, bp] = [0, x, c];
  else if (hh < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const to255 = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to255(rp)}${to255(gp)}${to255(bp)}`.toUpperCase();
}

/**
 * 任意 hex → 浅底 + 深墨。
 *
 * 色相沿用原色（保证同一色系的观感一致），饱和度和亮度固定到浅色区间，
 * 这样即使运营（或外部调用方）写进来一个深色，客户端也不会出现
 * 「深底 + 深字」导致文字看不见的情况。
 */
export function deriveThemeFromHex(hex: string): ArtistTheme {
  const hsl = hexToHsl(hex);
  if (!hsl) return NEUTRAL_ARTIST_THEME;
  // 无彩色（灰）时按中性处理，避免把纯灰染成某种色相
  if (hsl.s < 5) {
    return { name: "自定义", base: hslToHex(hsl.h, 0, 92), ink: hslToHex(hsl.h, 8, 30) };
  }
  return {
    name: "自定义",
    base: hslToHex(hsl.h, Math.min(45, Math.max(22, hsl.s * 0.55)), 90),
    ink: hslToHex(hsl.h, Math.min(55, Math.max(35, hsl.s)), 32),
  };
}

/** djb2：稳定、无依赖，跨端同一 id 必得同一色 */
export function stableHash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

function findPaletteByBase(base: string): ArtistTheme | null {
  const norm = normalizeHex(base);
  if (!norm) return null;
  const found = ARTIST_THEME_PALETTE.find((t) => t.base === norm);
  return found ? { ...found } : null;
}

/**
 * 解析艺人主题色。
 *
 * 结果记忆化：本函数是纯函数（相同入参必得相同输出），但每次调用都要跑一遍
 * normalizeHex 正则 + 可能的 hexToHsl/hslToHex 转换 + 对象展开。
 * 列表页每张 EventCard 的 theme computed 都会调它一次，且重渲染时被反复调用，
 * 而入参只有「后台配的 theme_color」与「artist_id」两种 —— 取值集合极小。
 * 故按入参缓存返回值，避免重复的颜色转换。
 *
 * ⚠️ 必须返回同一个对象引用而非副本：调用方（EventCard 等）只读不写，
 *    共享引用反而让 Vue 的依赖比对更早短路。若将来有调用方就地修改返回值，
 *    需要改成返回浅拷贝。
 *
 * 缓存必须有上限：key 是「theme_color|artist_id」，取值集合随浏览过的艺人单调增长，
 * 没有 TTL 也没有容量限制的话，条目会永久驻留。超过阈值就整表清空
 * （值本身是纯函数产物，清掉只是下次重算，代价可忽略）。
 */
const _themeCache = new Map<string, ArtistTheme>();
/** 缓存条目上限，超过即整表清空 */
const THEME_CACHE_MAX = 200;

export function resolveArtistTheme(
  themeColor?: string | null,
  seed?: string | null,
): ArtistTheme {
  // 空串与 null 归一为同一 key，避免缓存被等价入参切碎
  const colorKey = normalizeHex(themeColor) ?? "";
  const seedKey = (seed ?? "").trim();
  const cacheKey = `${colorKey}|${seedKey}`;
  const hit = _themeCache.get(cacheKey);
  if (hit) return hit;

  const norm = colorKey || null;
  let result: ArtistTheme;
  if (norm) {
    // 后台选的就是板内色 → 精确命中，ink 与运营在后台看到的配套色一致
    const preset = findPaletteByBase(norm);
    if (preset) {
      result = preset;
    } else {
      result = deriveThemeFromHex(norm);
    }
  } else if (!seedKey) {
    result = { ...NEUTRAL_ARTIST_THEME };
  } else {
    const idx = stableHash(seedKey) % ARTIST_THEME_PALETTE.length;
    result = { ...ARTIST_THEME_PALETTE[idx] };
  }

  if (_themeCache.size >= THEME_CACHE_MAX) _themeCache.clear();
  _themeCache.set(cacheKey, result);
  return result;
}

/** 判断一个颜色是否落在预设浅色板内（后台 Web 端校验用） */
export function isPresetThemeColor(hex?: string | null): boolean {
  return findPaletteByBase(hex ?? "") !== null;
}

/**
 * 给 hex 加透明度，输出 rgba()。
 * 用于浅色主题底上的描边、阴影等需要"同色系但更淡"的场合。
 * 入参非法时回退到中性灰，保证永远返回可用的 CSS 颜色。
 */
export function withAlpha(hex: string, alpha: number): string {
  const norm = normalizeHex(hex);
  if (!norm) return `rgba(90, 95, 107, ${alpha})`;
  const r = parseInt(norm.slice(1, 3), 16);
  const g = parseInt(norm.slice(3, 5), 16);
  const b = parseInt(norm.slice(5, 7), 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
