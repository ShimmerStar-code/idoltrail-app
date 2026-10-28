// 运行时协议正文与版本管理。
//
// 权威正文在服务端（GET /api/v1/public/agreements），包内的
// src/constants/agreements.ts 只是**离线兜底**。本模块负责：
//   1) 记住服务端拉到的最新正文与版本（内存 + storage 缓存）；
//   2) 计算「当前生效版本」= 服务端版本比包内新时用服务端，否则用包内；
//   3) 启动时比对版本号，决定是否刷新内容 / 是否需要重新征求用户同意。
//
// 为什么同意状态要跟着「生效版本」走：
//   隐私政策版本一变，用户此前对旧版本的同意就不再成立，必须重新征求。
//   所以 hasPrivacyConsent() 比较的是「本地已同意的版本」与「当前生效版本」，
//   而不是与包内常量比较 —— 否则服务端改了政策，App 永远不会重新征求同意。
//
// 生效版本的优先级规则（只允许版本前进，不允许回退）：
//   服务端版本 > 包内版本  → 用服务端（运营在后台改了政策，App 启动后生效）
//   服务端版本 ≤ 包内版本 → 用包内（后端还没跟上发版，以包内为准）
//   本地无缓存           → 用包内（首次安装 / 离线）

import {
  AGREEMENT_VERSION,
  PRIVACY_VERSION,
  getAgreementText,
  getAgreementTitle,
} from '@/constants/agreements'
import { agreementApi } from '@/api/agreement'
import type { AgreementType } from '@/types/agreement'

/** 本地缓存 key（storage 是明文存储，正文本身是公开内容，无敏感信息） */
const KEY_CACHE = 'fans:agreements:cache'

/** App 支持的协议类型白名单 */
export const AGREEMENT_TYPES: AgreementType[] = ['privacy_policy', 'user_agreement']

/** 生效协议的来源 */
export type AgreementSource = 'builtin' | 'server'

export interface EffectiveAgreement {
  type: AgreementType
  title: string
  version: string
  content: string
  source: AgreementSource
}

/** 服务端缓存镜像。进程内只保留一份，storage 只是为了跨启动复用。 */
let serverDocs: Partial<Record<AgreementType, EffectiveAgreement>> = {}
let cacheLoaded = false

/** 把任意字符串收敛到受支持的协议类型（与 constants 的 getAgreementText 语义一致） */
export function normalizeAgreementType(type: string): AgreementType {
  return type === 'user_agreement' ? 'user_agreement' : 'privacy_policy'
}

/** 包内兜底版本号 */
function builtinVersion(type: AgreementType): string {
  return type === 'user_agreement' ? AGREEMENT_VERSION : PRIVACY_VERSION
}

/**
 * 解析 v1.2.3 / 1.2.3 形式的版本号。
 * 解析不出来返回 null（调用方需要走字符串兜底比较）。
 */
function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(v || '').trim())
  if (!m) return null
  return [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)]
}

/**
 * 比较两个版本号：a < b 返回 -1，a === b 返回 0，a > b 返回 1。
 *
 * 版本号格式不标准时（后端被手工改坏）退化成字符串比较，
 * 保证「不相等就算有变化」，宁可多弹一次同意，也不要漏掉政策更新。
 */
export function compareVersion(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) {
    if (a === b) return 0
    return a > b ? 1 : -1
  }
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

/** storage 里缓存的单份协议结构 */
interface CachedAgreement {
  title?: string
  version?: string
  content?: string
}

/** 从 storage 恢复服务端缓存（模块首次使用时执行一次） */
function ensureCacheLoaded(): void {
  if (cacheLoaded) return
  cacheLoaded = true
  try {
    const raw = uni.getStorageSync(KEY_CACHE) as Record<string, CachedAgreement> | null
    if (!raw || typeof raw !== 'object') return
    for (const t of AGREEMENT_TYPES) {
      const d = raw[t]
      if (!d || typeof d.version !== 'string' || typeof d.content !== 'string' || !d.content) continue
      serverDocs[t] = {
        type: t,
        title: typeof d.title === 'string' ? d.title : getAgreementTitle(t),
        version: d.version,
        content: d.content,
        source: 'server',
      }
    }
  } catch (e) {
    console.warn('[agreements] 读取本地协议缓存失败', e)
  }
}

/** 把内存镜像写回 storage */
function persistCache(): void {
  try {
    const out: Record<string, { title: string; version: string; content: string }> = {}
    for (const t of AGREEMENT_TYPES) {
      const d = serverDocs[t]
      if (d) out[t] = { title: d.title, version: d.version, content: d.content }
    }
    uni.setStorageSync(KEY_CACHE, out)
  } catch (e) {
    console.warn('[agreements] 写入本地协议缓存失败', e)
  }
}

/**
 * 当前生效的协议（正文 + 版本）。
 *
 * 服务端版本必须**新于**包内版本才会被采用，避免后端没跟上发版时用回旧正文。
 */
export function getEffectiveAgreement(type: string): EffectiveAgreement {
  ensureCacheLoaded()
  const t = normalizeAgreementType(type)
  const builtin = builtinVersion(t)
  const doc = serverDocs[t]
  if (doc && doc.content && compareVersion(doc.version, builtin) > 0) return doc
  return {
    type: t,
    title: getAgreementTitle(t),
    version: builtin,
    content: getAgreementText(t),
    source: 'builtin',
  }
}

/** 当前生效的协议版本号 */
export function getEffectiveVersion(type: string): string {
  return getEffectiveAgreement(type).version
}

/** 当前生效的隐私政策版本号 */
export function getEffectivePrivacyVersion(): string {
  return getEffectiveVersion('privacy_policy')
}

/** 当前生效的用户协议版本号 */
export function getEffectiveAgreementVersion(type: string): string {
  return getEffectiveVersion(type)
}

export interface AgreementSyncResult {
  /** 生效版本发生变化的协议类型 */
  changed: AgreementType[]
  /** 隐私政策版本是否变化（变化则需要重新征求用户同意） */
  privacyChanged: boolean
  /** 服务端是否拉取成功（false 表示离线或后端异常，已回落本地版本） */
  fetched: boolean
}

/**
 * 启动时从服务端同步协议正文与版本。
 *
 * 只在服务端版本**新于**当前生效版本时才采纳，且只取白名单内的类型；
 * 拉取失败静默回落（网络不通、后端未部署 content.json 都不能影响 App 使用）。
 *
 * @returns 哪些协议的生效版本发生了变化
 */
export async function syncAgreementsFromServer(): Promise<AgreementSyncResult> {
  const result: AgreementSyncResult = { changed: [], privacyChanged: false, fetched: false }

  let res
  try {
    res = await agreementApi.fetchAll()
  } catch (e) {
    console.warn('[agreements] 拉取服务端协议失败，沿用本地版本', e)
    return result
  }

  const list = Array.isArray(res?.types) ? res.types : []
  const next: Partial<Record<AgreementType, EffectiveAgreement>> = {}
  for (const raw of list) {
    if (!raw || typeof raw.version !== 'string' || !raw.version) continue
    if (typeof raw.content !== 'string' || !raw.content) continue
    const type = normalizeAgreementType(raw.type)
    const current = getEffectiveAgreement(type)
    if (compareVersion(raw.version, current.version) <= 0) continue
    next[type] = {
      type,
      title: typeof raw.title === 'string' && raw.title ? raw.title : current.title,
      version: raw.version,
      content: raw.content,
      source: 'server',
    }
  }

  if (Object.keys(next).length) {
    serverDocs = { ...serverDocs, ...next }
    persistCache()
    result.changed = Object.keys(next) as AgreementType[]
    result.privacyChanged = result.changed.includes('privacy_policy')
  }
  result.fetched = true
  return result
}

/** 清除本地缓存的协议正文（下次启动重新从服务端拉取） */
export function clearAgreementCache(): void {
  serverDocs = {}
  try {
    uni.removeStorageSync(KEY_CACHE)
  } catch (e) {
    console.warn('[agreements] 清除本地协议缓存失败', e)
  }
}
