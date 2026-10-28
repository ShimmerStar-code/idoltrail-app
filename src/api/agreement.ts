// 隐私政策 / 用户协议 API 封装。
// 后端路由：/api/v1/public/agreements（**公开接口，不需要鉴权**）。
//
// 为什么要从服务端拉正文：
//   · 应用市场审核要求隐私政策有独立可公开访问的 URL，正文以服务端为唯一真源；
//   · 政策修订不需要发版：改 content.json → 重启后端 → App 下次启动自动拉取；
//   · App 内置的那份（src/constants/agreements.ts）只作离线兜底。
//
// 接口是公开的，用 skipAuth: true：不带 token，也就不会触发 refresh / 401 重放，
// 免得协议拉取被会话过期流程带偏。

import { request } from '@/utils/request'
import type { AgreementDocument, AgreementsContent } from '@/types/agreement'

export const agreementApi = {
  /**
   * 拉取全部协议正文与版本。
   *
   * silent: true —— 拉取失败（离线 / 后端未部署）不能弹 toast 打扰用户，
   * App 应当静默回落到包内兜底正文。
   */
  fetchAll: () =>
    request<AgreementsContent>('/public/agreements', {
      method: 'GET',
      skipAuth: true,
      silent: true,
    }),

  /** 拉取单份协议正文与版本（type 取 privacy_policy / user_agreement） */
  fetchOne: (type: string) =>
    request<AgreementDocument>(`/public/agreements/${type}`, {
      method: 'GET',
      skipAuth: true,
      silent: true,
    }),
}
