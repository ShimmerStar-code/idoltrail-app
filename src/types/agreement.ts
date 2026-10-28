// 隐私政策 / 用户协议模块类型定义。
//
// 与后端 `internal/agreements` 包一一对应：
//   GET /api/v1/public/agreements → AgreementsContent
//   GET /api/v1/public/agreements/:type → AgreementDocument

/** 协议类型，取值与后端 user_agreements.agreement_type 一致 */
export type AgreementType = 'privacy_policy' | 'user_agreement'

/** 单份协议文档（标题 + 版本 + 正文） */
export interface AgreementDocument {
  type: string
  title: string
  version: string
  content: string
}

/**
 * 服务端返回的协议正文集合。
 *
 * ⚠️ types 的元素类型是后端写死的 `Document`，**type 字段是普通 string**，
 *    不是 TS 的字面量联合 —— 不能直接当成 AgreementType 用，
 *    需要经过白名单过滤（见 utils/agreementContent.ts）。
 */
export interface AgreementsContent {
  types: AgreementDocument[]
  /** 政策发布日期 */
  release_date?: string
  /** 当前隐私政策版本 */
  privacy_version?: string
  /** 当前用户协议版本 */
  agreement_version?: string
  /** 运营主体 */
  company?: string
  /** 管辖地 */
  region?: string
  /** 联系方式 */
  contact_email?: string
  /** 正文来源标注，便于人工核对 */
  source?: string
}
