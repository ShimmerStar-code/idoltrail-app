# idoltrail-app 上线前 TODO

> 基于当前代码实际状态整理。P0 阻塞上线 → P1 安全/合规 → P2 体验/质量 → P3 代码债。
> 完成任何一条：勾选 `- [ ]` → 在「最后更新」加日期 → 补一行完成记录。

最后更新：2026-10-13

---

## P0 — 阻塞上线

### 0.1 DCloud AppID
- **现状**：[src/manifest.json](src/manifest.json) 的 `appid` 是 `__UNI__REPLACE_WITH_DCLOUD_APPID__`
- **动作**：DCloud 后台创建应用，替换为真实 `__UNI__XXXXXXX`
- **验收**：HBuilderX 能真机运行到 Android/iOS，能云打包

### 0.2 隐私政策正文整改（合规风险）
- **现状**：[src/pages/agreement/detail.vue:53](src/pages/agreement/detail.vue#L53) 仍披露「微信 openid / unionid（用于识别身份）」，但 App 端**不收集** openid/unionid（`src/utils/device.ts` 用的是设备 ID）
- **动作**：改写「我们收集的信息」小节，只列手机号、设备标识、位置、头像昵称；同时核对 iOS `privacyDescription` 与 Android `android.permissions` 文案
- **验收**：政策正文与实际采集字段逐条对得上；法务确认
- **风险**：不整改可能被应用商店驳回或被监管投诉

### 0.3 捐赠入口在 App 上是死路
- **现状**：[src/pages/profile/donate.vue:261](src/pages/profile/donate.vue#L261) 调 `donateApi.xpaySign`，后端 `xpay` 要求微信 openid → App 用户**必然 40921 失败**
- **动作**（二选一）：
  1. MVP 期直接隐藏捐赠入口（`VITE_DONATE_ENABLED=false`）
  2. 接原生支付（Android 支付宝/微信 App 支付、iOS StoreKit IAP）+ 后端对账接口
- **验收**：入口隐藏，或下单链路可真机跑通

---

## P1 — 安全 / 合规

### 1.1 token 存储未加密
- **现状**：[src/utils/storage.ts](src/utils/storage.ts) 用 `uni.setStorageSync` 明文存 access/refresh token，key 为 `fans:auth:access` / `fans:auth:refresh`
- **动作**：评估 Android `EncryptedSharedPreferences` / iOS Keychain 方案；若暂不做，确认 refresh_token 有效期足够短
- **验收**：抓包/root 后无法直接读出 token 明文

### 1.2 401 静默 refresh 链路未压测
- **现状**：[src/utils/request.ts](src/utils/request.ts) 实现了 refresh + 重放，但只覆盖部分 code
- **动作**：跟后端确认 401 系列全部 code 含义（access 过期 / refresh 过期 / 被踢 / 被封）；真机让 access_token 强制失效 → 验证自动 refresh → 再失效 → 验证 `handleSessionExpired()` 回到原页面
- **验收**：连续 3 次 401 后能正确回跳

### 1.3 系统权限拒绝路径未实测
- **现状**：`ensureSystemPermission()` 已做前置拦截，但拒绝后的用户引导文案未逐个平台实测
- **动作**：真机分别拒绝定位、通知、相册、麦克风，确认有引导去设置的文案
- **验收**：四类权限各测一遍，拒绝后功能不崩、有引导

---

## P2 — 体验 / 质量

### 2.1 弹层提示刚改完，需真机回归
- **现状**：本轮把 `LoginModal` / `PrivacyPopup` / `CityPicker` / `NotificationPromptModal` 的错误提示从 `uni.showToast` 改为内联文案，并在 `App.vue` 提升 `uni-toast`/`uni-modal` 到 `z-index: 10000`。类型检查与 H5 构建已通过，**未在 App / H5 真机验证**
- **动作**：逐个测：错误验证码、未勾协议、定位失败/超时、隐私拒绝、通知权限拒绝
- **验收**：五种场景界面都有可见反馈

### 2.2 登录按钮 Loading
- **现状**：[src/components/LoginModal/index.vue](src/components/LoginModal/index.vue) `onLogin` 时按钮置灰但无 spinner
- **动作**：加 spinner 或「登录中...」文案
- **不影响上线**

### 2.3 协议正文法务确认
- **现状**：[src/pages/agreement/detail.vue](src/pages/agreement/detail.vue) 内嵌协议内容，非 placeholder，但未经法务确认
- **动作**：法务/产品过一遍用户协议与隐私政策全文

### 2.4 分享能力未接入
- **现状**：[src/utils/share.ts](src/utils/share.ts) 完整实现但**全仓零调用**，页面里没有任何分享入口
- **动作**：确认是否需要分享；有则在活动详情/艺人详情接入，并补 `sdkConfigs` 渠道 AppID

### 2.5 死代码清理
- **现状**（均无调用方）：
  - [src/utils/share.ts](src/utils/share.ts) 整个文件
  - [src/api/user.ts:75-86](src/api/user.ts#L75-L86) `bindPhone` / `unbindPhone`（微信小程序专用）
  - [src/types/donate.ts](src/types/donate.ts) `JSAPIPrepayParams` / `XPayParams`（小程序支付结构）
- **动作**：确认后删除，或移到 `docs/legacy/` 说明保留原因

### 2.6 小程序时代注释清理
- **现状**：约 12 处注释仍在讲 `wx.login` / `wx.getMenuButtonBoundingClientRect` / 订阅消息配额等小程序概念，散落在 `App.vue`、`main.ts`、`utils/{privacy,request,device,system,storage}.ts`、`components/{PrivacyPopup,NotificationPromptModal}`、`pages/profile/messages.vue`、`components/Subscribe/CitySubCard.vue`
- **动作**：逐条判断——描述 App 现状的删掉，纯历史包袱的直接清掉

---

## P3 — 代码债

### 3.1 `src/types/donate.ts` 接口重复定义
- **现状**：`DonationOrderStatus` 在 63 行与 77 行各定义一次，内容相同
- **动作**：删掉重复的那份

### 3.2 ESLint 全是 warning
- **现状**：`npm run lint` → **185 个 warning，0 error**

| 规则 | 数量 | 说明 |
|------|------|------|
| `@typescript-eslint/no-explicit-any` | 96 | 多在 `utils/`、`types/`、`api/` 的动态数据处 |
| `vue/multi-word-component-names` | 34 | 组件目录都叫 `index.vue` |
| `vue/attributes-order` | 28 | 属性书写顺序 |
| `vue/attribute-hyphenation` | 17 | 驼峰 props 未写成 kebab-case |
| `vue/v-on-event-hyphenation` | 10 | 事件名未写 `@xxx-yyy` |

- **动作**：后三项 `vue/*` 是纯风格，`--fix` 能自动修 55 条；`multi-word-component-names` 建议在 eslint 配置里对 `components/*/index.vue` 豁免；`no-explicit-any` 逐个收敛或对 `utils/` 降级为 off。别让 warning 积累成噪音。

### 3.3 `DonationOrderStatus` 之外的类型债
- 详见历史 TODO 中已被 App 版改造覆盖的部分；`npm run type-check` 当前是**绿的**，无阻塞项

---

## P4 — 后续功能

- [ ] 个人主页扩展：我的订阅数 / 活动日历 / 收藏
- [ ] 消息中心 [src/pages/profile/messages.vue](src/pages/profile/messages.vue) 接后端 `notifications`
- [ ] 搜索页接 `/search/artists|events|places`（后端有接口，前端未实接；本地还缺 Meilisearch）
- [ ] 场馆页：后端 `places` 表目前**无数据**，需先灌数据
- [ ] i18n 中英双语
- [ ] 埋点 SDK 接入
- [ ] 错误监控上报
- [ ] 暗色模式（`theme` 监听）
- [ ] 订阅列表持久化，避免冷启动重拉

---

## 关联文档

- [README.md](README.md) — 环境、架构、接口清单
- [CLAUDE.md](CLAUDE.md) — 开发约定与红线
- [DESIGN.md](DESIGN.md) — UI 设计规格
- [../README.md](../README.md) — 仓库总览（后端 / App / 小程序三端关系）