/**
 * 默认头像的本地化存储。
 *
 * 背景
 * ─────
 * 后端 model.ResolveAvatar 会把「库里没有头像」的艺人填成 OSS 默认图地址，
 * 于是偶像首页这种一次渲染 9 × N 个艺人的页面，会对同一张
 * https://.../avatar/default/boy.png 反复发几十次网络请求——
 * 同一张图下载几十遍，白白吃流量、拖慢首屏，弱网下还会看到一片空白。
 *
 * 现在的做法
 * ──────────
 * 1. 4 张默认图随安装包下发（static/avatar/default/*.png），任何时候都有一份可用的；
 * 2. 每天首次冷启动静默从 OSS 覆盖一份到本地缓存目录（见 syncDefaultAvatars）；
 * 3. 渲染侧（defaultAvatarSrc）永远**同步**返回本地路径，零网络请求。
 *
 * 第 3 点刻意是同步的：下载是后台异步动作，绝不能让首屏头像等它。
 * 今天没下成功就直接用包内那份，最坏情况只是运营换的新图晚一天生效。
 *
 * 平台：App 端（Android / iOS）走文件系统缓存；H5 端没有文件系统，
 * 只用包内那一份（H5 仅开发调试用，见 CLAUDE.md）。
 */

/** 4 类默认头像，key 与包内文件名、OSS 文件名一致 */
export const DEFAULT_AVATAR_KEYS = ['boy', 'girl', 'group', 'virtual_persona'] as const

export type DefaultAvatarKey = (typeof DEFAULT_AVATAR_KEYS)[number]

/** OSS 源，仅 syncDefaultAvatars 下载用 */
const OSS_BASE = 'https://idoltrail-static.oss-cn-beijing.aliyuncs.com/avatar/default'

/** 本地缓存文件名前缀，落在 USER_DATA_PATH 根目录下（该目录必定存在，免 mkdir） */
const FILE_PREFIX = 'default_avatar_'

/** 「今天已同步过」的标记 */
const KEY_SYNC_DATE = 'fans:avatar:sync-date'

/** 包内路径：断网 / 首启 / 下载失败时的兜底，也是 H5 端的唯一来源 */
export function bundledDefaultAvatar(key: DefaultAvatarKey): string {
  return `/static/avatar/default/${key}.png`
}

/**
 * 判断后端下发的 avatar_url 是不是默认占位图。
 *
 * 口径对齐后端 model.IsDefaultAvatarURL（path 含 `/avatar/default/`）。
 * 这里不用「4 个 URL 全等集合」是刻意的：OSS 域名会变、URL 也可能带查询参数
 * （如图片处理参数），全等集合会全部漏判，然后每个艺人各拉一次默认图。
 */
export function isDefaultAvatarUrl(url?: string): boolean {
  return !!url && url.indexOf('/avatar/default/') >= 0
}

/** 默认图文件名 → 分类 */
const FILENAME_KEYS: Record<string, DefaultAvatarKey> = {
  boy: 'boy',
  girl: 'girl',
  group: 'group',
  virtual_persona: 'virtual_persona',
}

/**
 * 从默认图 URL 反推分类，非默认图或认不出文件名时返回 null。
 *
 * 存在的理由：部分精简 VO（如 types/subscription.ts 的 EventBrief.artist）
 * 只下发 avatar_url，没有 type/gender。没有这条兜底，
 * 订阅页活动卡片上的女艺人 / 组合会被统一渲染成男头像。
 * 后端 ResolveAvatar 已经按 type+gender 算过，这里反推的结果同样是可信的。
 */
export function defaultAvatarKeyFromUrl(url?: string): DefaultAvatarKey | null {
  if (!isDefaultAvatarUrl(url)) return null
  const m = /\/avatar\/default\/([a-z_]+)\./i.exec(url as string)
  if (!m) return null
  return FILENAME_KEYS[m[1].toLowerCase()] ?? null
}

/**
 * uni.getFileSystemManager 的最小能力面。
 * @dcloudio/types 未收录该 API（H5 端也不存在），这里局部声明用到的两个方法，
 * 不去动全局类型，避免影响其他模块。
 */
interface UniFsManager {
  accessSync(path: string): void
  writeFileSync(path: string, data: ArrayBuffer | Uint8Array): void
}

function getFs(): UniFsManager | null {
  const u = uni as unknown as { getFileSystemManager?: () => UniFsManager }
  try {
    return u.getFileSystemManager?.() ?? null
  } catch {
    // H5 等无文件系统平台
    return null
  }
}

/** 本地缓存绝对路径；无文件系统平台（H5）返回空串 */
function cachedFilePath(key: DefaultAvatarKey): string {
  const dir = (uni as unknown as { env?: { USER_DATA_PATH?: string } }).env?.USER_DATA_PATH
  return dir ? `${dir}/${FILE_PREFIX}${key}.png` : ''
}

/**
 * 解析结果按 key 缓存整个进程。
 *
 * accessSync 是同步 IO，不能留在渲染路径上：偶像首页一次渲染上百个头像，
 * 每个都 accessSync 一次会在主线程上打出可观的卡顿。
 * 覆盖只发生在冷启动（syncDefaultAvatars），本次进程解析一次就够，
 * 覆盖成功后会主动把这份缓存清掉，下一次渲染重新解析即可用上新图。
 */
let resolved: Record<DefaultAvatarKey, string> | null = null

function resolveAll(): Record<DefaultAvatarKey, string> {
  const out = {} as Record<DefaultAvatarKey, string>
  const fs = getFs()
  for (const key of DEFAULT_AVATAR_KEYS) {
    const cached = cachedFilePath(key)
    if (fs && cached) {
      try {
        fs.accessSync(cached)
        out[key] = cached
        continue
      } catch {
        // 还没下过，或被系统清掉 → 走包内
      }
    }
    out[key] = bundledDefaultAvatar(key)
  }
  return out
}

/**
 * 默认头像的可展示地址 —— 全 app 唯一的默认头像出口。
 * 同步返回，永不发起网络请求。
 */
export function defaultAvatarSrc(key: DefaultAvatarKey): string {
  if (!resolved) resolved = resolveAll()
  return resolved[key]
}

function todayStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 每天首次冷启动静默覆盖本地默认头像。
 *
 * 不做版本比对、不重试：直接覆盖，失败就用包内那份等下一天。
 * 这是有意的取舍——省掉 manifest/ETag 那一整套机制，
 * 而默认图是低频变更的运营资源，晚一天生效无伤大雅。
 *
 * 全程不阻塞、不抛错、不打扰用户。
 */
export function syncDefaultAvatars(): void {
  const fs = getFs()
  if (!fs) return
  if (uni.getStorageSync(KEY_SYNC_DATE) === todayStamp()) return
  // 先打点再下载：失败当天不再重试，避免弱网下每次冷启动都白打 4 个请求
  uni.setStorageSync(KEY_SYNC_DATE, todayStamp())
  for (const key of DEFAULT_AVATAR_KEYS) void downloadOne(fs, key)
}

function downloadOne(fs: UniFsManager, key: DefaultAvatarKey): Promise<void> {
  const target = cachedFilePath(key)
  return new Promise<void>((resolve) => {
    uni.downloadFile({
      url: `${OSS_BASE}/${key}.png`,
      success: (raw) => {
        // @dcloudio/types 的 DownloadSuccessData 漏了 data 字段，这里补断言
        const { statusCode, data } = raw as unknown as {
          statusCode: number
          data: ArrayBuffer
        }
        if (statusCode !== 200 || !data) return resolve()
        try {
          fs.writeFileSync(target, new Uint8Array(data))
          resolved = null // 强制下次渲染重新解析，用上刚覆盖的新文件
        } catch (e) {
          console.warn('[avatar] 写入默认头像失败', key, e)
        }
        resolve()
      },
      fail: (err) => {
        console.warn('[avatar] 下载默认头像失败', key, err?.errMsg ?? err)
        resolve()
      },
    })
  })
}
