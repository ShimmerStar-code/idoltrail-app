# idoltrail-app 上线前 TODO

> 基于当前代码实际状态整理。P0 阻塞上线 → P1 安全/合规 → P2 体验/质量 → P3 代码债。
> 完成任何一条：勾选 `- [ ]` → 在「最后更新」加日期 → 补一行完成记录。

最后更新：2026-10-23

---

## P0 — 阻塞上线

### 0.1 uni-push 厂商离线通道未生效
- **现状**：`src/manifest.json` 的 `app-plus.distribute.unipush.offline` 是 `false`。
  HBuilderX 编译器按 `=== true` 严格判定，`false` 等于**没开**厂商离线通道：
  App 被回收后基本收不到推送，只剩 uni-push 官方在线通道。
- **动作**：改成 `true`，并确认 DCloud 后台已配好华为/小米/OPPO/vivo 厂商通道
- **验收**：真机杀掉 App 后仍能收到厂商通道推送
- **备注**：`src/manifest.json` 当前还有其它未提交改动（description、versionCode、
  `compatible.ignoreVersion`、push 图标块等），**单独提交这一处**更安全

### 0.2 推送 token 上报结果被丢弃
- **现状**：`src/pages/profile/notifications.vue:120` 调 `syncPushToken()` 但**丢弃返回值**。
  后端绑定失败（device_id 缺失/重复/未登录）时没有任何提示，
  表现是「用户开了通知开关但永远收不到推送」，且无法定位。
- **动作**：接收返回值，失败时内联提示（弹窗内不要用 `uni.showToast`，见 CLAUDE.md 弹层约定）
  并允许重试
- **验收**：绑定失败有可见反馈，不静默

---

## P1 — 安全 / 合规 / 功能正确性

### 1.1 token 存储未加密
- **现状**：[src/utils/storage.ts](src/utils/storage.ts) 用 `uni.setStorageSync` 明文存 access/refresh token，key 为 `fans:auth:access` / `fans:auth:refresh`
- **动作**：评估 Android `EncryptedSharedPreferences` / iOS Keychain 方案；若暂不做，确认 refresh_token 有效期足够短
- **备注**：refresh_token 已改 60 天滑动续期（见「已完成」），这让「有效期足够短」更难成立，优先级上升

### 1.2 401 静默 refresh 链路未压测
- **现状**：[src/utils/request.ts](src/utils/request.ts) 实现了 refresh + 重放，但只覆盖部分 code
- **动作**：跟后端确认 401 系列全部 code 含义（access 过期 / refresh 过期 / 被踢 / 被封）；真机让 access_token 强制失效 → 验证自动 refresh → 再失效 → 验证 `handleSessionExpired()` 回到原页面
- **验收**：连续 3 次 401 后能正确回跳

### 1.3 系统权限拒绝路径未实测
- **现状**：`ensureSystemPermission()` 已做前置拦截，但拒绝后的用户引导文案未逐个平台实测
- **动作**：真机分别拒绝定位、通知、相册、麦克风，确认有引导去设置的文案
- **验收**：四类权限各测一遍，拒绝后功能不崩、有引导

### 1.4 语言切换是死 UI
- **现状**：[src/pages/profile/settings.vue:18-24](src/pages/profile/settings.vue#L18) 有「中文 / English」切换项，
  但**没有实际生效逻辑**（无 i18n 运行时、无持久化），点了不会有任何变化。
- **动作**：二选一 —— 接入 i18n 运行时，或先隐藏该行（不要留一个点了没反应的控件）
- **验收**：要么文案真的切换，要么入口不出现

### 1.5 管理后台「用户管理」页接口契约错配
- **现状**：[src/pages/admin/users.vue](src/pages/admin/users.vue) 请求 `/admin/users`，
  但后端该路由是**后台管理员账号**（`admin_member`）的 CRUD，返回里没有 `nickname`/`avatar_url`；
  C 端用户的只读列表在 `/admin/c-users`（`status` 是 **int**：`1=active 2=disabled 3=locked 4=pending_delete`，`0=不过滤`；
  `pending_delete` 是 `yes`/`no` 字符串）。
  页面现在传的是字符串 `status=active` → Go 侧 `strconv.Atoi` 失败退回 0 → **状态筛选完全不生效**。
- **动作**：改用 `/admin/c-users` 重写列表与筛选（该接口**只读**，封禁/解冻没有对应接口，
  按钮要去掉或另接专用接口）
- **优先级说明**：生产构建里本页面被 `checkAdminGate()` 强制关闭、入口不出现，**不阻塞 C 端发版**

### 1.6 开发期捐赠入口空转
- **现状**：`.env.dev` 的 `VITE_DONATE_ENABLED=true` 但 `VITE_DONATE_NATIVE_READY=false`，
  dev 包里赞助 banner 常显，Android 点进去只看到「通道未开通」。
- **动作**：二选一 —— dev 也把 `VITE_DONATE_ENABLED` 关掉，或等后端对账接口就绪后打开 NATIVE_READY
- **优先级说明**：生产 `.env.prod` 是 `VITE_DONATE_ENABLED=false`，不阻塞发版

---

## P2 — 体验 / 质量

### 2.1 弹层提示改内联后需真机回归
- **现状**：已把 `LoginModal` / `PrivacyPopup` / `CityPicker` / `NotificationPromptModal` 的错误提示从 `uni.showToast` 改为内联文案，并在 `App.vue` 提升 `uni-toast`/`uni-modal` 到 `z-index: 10000`。类型检查与构建已通过，**未在 App / H5 真机验证**
- **动作**：逐个测：错误验证码、未勾协议、定位失败/超时、隐私拒绝、通知权限拒绝
- **验收**：五种场景界面都有可见反馈

### 2.2 登录按钮 Loading
- **现状**：[src/components/LoginModal/index.vue](src/components/LoginModal/index.vue) `onLogin` 时按钮置灰但无 spinner
- **动作**：加 spinner 或「登录中...」文案
- **不影响上线**

### 2.3 协议正文法务确认
- **现状**：[src/pages/agreement/detail.vue](src/pages/agreement/detail.vue) 渲染的是**当前生效版本**正文
  （服务端优先、包内兜底），非 placeholder，但未经法务确认
- **动作**：法务/产品过一遍用户协议与隐私政策全文
- **注意**：法务改完正文后必须 `npm run export:agreements` 同步后端 `content.json` 并重新部署后端，
  否则线上拉到的仍是旧正文

### 2.4 分享能力未接入
- **现状**：[src/utils/share.ts](src/utils/share.ts) 完整实现但**全仓零调用**，页面里没有任何分享入口
- **动作**：确认是否需要分享；有则在活动详情/艺人详情接入，并补 `sdkConfigs` 渠道 AppID

---

## P3 — 代码债

### 3.1 ESLint 全是 warning
- **现状**：`npm run lint` → **194 个 warning，0 error**（2026-10-23 实测）

| 规则 | 说明 |
|------|------|
| `@typescript-eslint/no-explicit-any` | 最多，多在 `utils/`、`types/`、`api/` 的动态数据处 |
| `vue/multi-word-component-names` | 组件目录都叫 `index.vue` |
| `vue/attributes-order` | 属性书写顺序 |
| `vue/attribute-hyphenation` | 驼峰 props 未写成 kebab-case |
| `vue/v-on-event-hyphenation` | 事件名未写 `@xxx-yyy` |

- **动作**：`vue/*` 三项是纯风格，`--fix` 能自动修 48 条；`multi-word-component-names` 建议在 eslint 配置里对 `components/*/index.vue` 豁免；`no-explicit-any` 逐个收敛或对 `utils/` 降级为 off。别让 warning 积累成噪音。

### 3.2 类型债
- `npm run type-check` 当前是**绿的**，无阻塞项
- 剩余主要是 `any` 收敛（与 3.1 同一批）

---

## P4 — 后续功能

- [ ] 个人主页扩展：我的订阅数 / 活动日历 / 收藏
- [ ] 消息中心 [src/pages/profile/messages.vue](src/pages/profile/messages.vue) 接后端 `notifications`
- [x] 搜索接后端 `/search/artists|events|places` —— 已实接（`src/stores/search.ts` + `src/components/SearchOverlay`）；
      独立的 `pages/search` 页与分包已删除（无入口，功能由 SearchOverlay 承担）
- [ ] 场馆页：后端 `places` 表目前**无数据**，需先灌数据
- [ ] i18n 中英双语（与 1.4 同一件事）
- [ ] 埋点 SDK 接入
- [ ] 错误监控上报
- [ ] 暗色模式（`theme` 监听）
- [ ] 订阅列表持久化，避免冷启动重拉

---

## 已完成（近期）

- [x] **2026-10-23** DCloud AppID：已是真实值 `__UNI__F1F9279`
- [x] **2026-10-23** 隐私政策正文整改：已与实际采集字段对齐（`src/constants/agreements.ts` v1.1.0），上架前仍需人工复核
- [x] **2026-10-23** 协议正文改为服务端统一下发：`GET /public/agreements` 为运行时权威来源，
      包内 `src/constants/agreements.ts` 作离线兜底；启动按版本号刷新缓存，隐私政策版本变化即重新征求同意
      （`src/utils/agreementContent.ts` / `src/utils/privacy.ts` / `src/App.vue`）
- [x] **2026-10-23** 捐赠链路去小程序化：删掉 `donateApi.xpaySign` 与 `types/donate.ts` 的 XPay 段，
      客户端改走 `src/utils/nativePay.ts`；生产 `VITE_DONATE_ENABLED=false` 隐藏入口
- [x] **2026-10-23** 死代码清理：`api/user.ts` 6 个零调用方法、`types/auth.ts` 的 `Device`/`LoginLog`、
      `constants/cities.ts` 的 `ALL_CITIES`、`pages/search` 分包与页面、3 个骨架组件、
      `static/icons/{social-skype.svg,default-city.png,donate-banner.png}`
- [x] **2026-10-23** 资源瘦身：18 张打包图标从 `src/static/icons/app/` 移到根级 `app-icons/`（694 KB 不再进运行时包），
      `src/static/logo.png` 1024→256（558 KB→28 KB）
- [x] **2026-10-23** `donate.vue` 的 `PREVIEW` 预览脚手架（恒假死代码 + 假档位兜底）已清除
- [x] **2026-10-23** 观演须知兜底文案加来源标注（通用提示 ≠ 主办方公告）
- [x] **2026-10-23** 文档同步：`CLAUDE.md` / `README.md` / `DEPLOY.md` / `TODO.md` / `.env.*` 注释与代码现状对齐
- [x] **2026-10-23** 订阅页重复请求合并为 `loadAllTabs()`；`artistTheme` 缓存上限 200 条；
      `userStore.clear()` 补 `clearReturnTo()`
- [x] **2026-10-23** 60 天滑动续期：后端 `JWT_REFRESH_EXPIRE=1440h` + App 侧 `refresh_expires_at` 重放逻辑
      （**已提交但未发版**，生产 v2 栈仍为 720h，需授权后在 `47.94.165.221` 的 v2 隔离栈更新）

---

## 关联文档

- [README.md](README.md) — 环境、架构、接口清单
- [CLAUDE.md](CLAUDE.md) — 开发约定与红线
- [DEPLOY.md](DEPLOY.md) — 构建与发版流程
- [DESIGN.md](DESIGN.md) — UI 设计规格
- [../README.md](../README.md) — 仓库总览（后端 / App / 小程序三端关系）
