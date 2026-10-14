# idoltrail-app — Android / iOS 独立 App 前端

演唱会 / 音乐活动信息平台的 **App 端**。uni-app + Vue 3 + TypeScript。

## 技术栈

- uni-app（`@dcloudio/*` 3.0.0-4080420251103001）+ Vue 3 + TypeScript
- Pinia 状态管理
- uview-plus **未使用**；UI 组件走 `@dcloudio/uni-ui` 的 easycom
- 构建：Vite 5 / HBuilderX CLI

## 关键约定

### 平台

- 目标平台只有 **App（Android / iOS）**，H5 仅为开发调试用。
- 条件编译一律用 `#ifdef APP-PLUS` / `#ifndef APP-PLUS`，**全仓不存在 `#ifdef MP-WEIXIN`**。
- 不要引入 `uni.getMenuButtonBoundingClientRect()`（小程序专属），导航栏尺寸统一走 `src/utils/system.ts` 的 `getNavBarMetrics()`。

### 登录

App 端无免密登录能力，登录链路固定为：

```
LoginModal → authApi.sendSms → authApi.phoneLogin → userStore.loginWithPhone
```

- 后端接口：`POST /auth/sms/send`、`POST /auth/phone-login`、`POST /auth/refresh`
- 未注册手机号自动注册
- 这两个接口在 `src/api/auth.ts` 里必须传 `silent: true`（原因见下）
- 「账号管理」页的手机号是登录凭证本身，只能更换，不能解绑

### 请求层

页面**不得**直接调用 `uni.request`，一律走 `src/utils/request.ts`。

`request.ts` 的 `RequestOptions` 有 `silent?: boolean`：

- `silent: true` → 业务失败时**不弹全局 toast**，只 `reject`
- 用于「弹窗打开期间」的场景，此时自定义弹窗的 mask（`z-index: 9999`）会完全遮住 H5 的 `uni-toast`（`z-index: 999`），表现为「日志有错、界面没反应」
- **非静默时依然弹 toast**，全局兜底不丢

### 弹层与提示

- 弹窗打开期间的错误提示一律**内联展示**，不要用 `uni.showToast`：`LoginModal` / `PrivacyPopup` / `CityPicker` / `NotificationPromptModal` 均已改为内联文案。
- `src/App.vue` 里 `uni-toast` / `uni-modal` 被提升到 `z-index: 10000`，高于所有 popup 的 9999。新增全局弹层时注意层级顺序。
- 弹窗关闭动画结束再弹 toast 时，加 `setTimeout`（约 350–400ms）。

### 页面结构

- `src/pages.json` **不声明原生 tabBar**，底部导航由页面内 `<TabBar>` 自绘，切换走 `switchTabPage()`。
- **新页面必须用 `<PageLayout>` 包裹**。`LoginModal` / `PrivacyPopup` / `DisclaimerPopup` / `NotificationPromptModal` 由 `PageLayout` 挂载，不在 `App.vue` 的 template 里。
- 分包：`pages/event`、`pages/place`、`pages/search`、`pages/agreement`、`pages/admin`。

### 样式红线

- **`input` / `textarea` 禁止设置 `box-sizing: border-box`**（H5 端会导致无法聚焦、无法输入）。
- 组件文件名与注册名用 PascalCase，如 `ArtistCard.vue`。
- 业务数据走 Pinia store，禁止用 `globalData` / storage 跨页面传状态。
- 所有接口响应类型必须在 `src/types/` 定义。
- 源文件统一 **UTF-8 无 BOM**；`.gitignore` 已忽略 `.hbuilderx/`，不要提交本地工具状态。

## 目录结构

```
src/
├── api/          # 接口封装，按模块拆分（auth/user/event/artist/subscription/...）
├── components/   # 公共组件，PascalCase 目录
├── composables/  # usePush（uni-push）/ useNotificationSocket
├── constants/    # cities / genres / eventMeta / agreements
├── pages/        # 页面，PageLayout 包裹
├── stores/       # Pinia store
├── types/        # TypeScript 类型
└── utils/        # env / request / adminToken / privacy / system / location / storage / pages / device
```

## 环境变量

`.env`（本地不入库敏感信息）与 `.env.example`：

```bash
VITE_API_BASE_URL=http://<WSL_IP>:8081/api/v1   # 必填，生产构建缺失或指向 localhost 会 fail build
VITE_PUSH_ENABLED=false                          # uni-push 开关
VITE_DONATE_ENABLED=false                        # 捐赠入口总开关
VITE_DONATE_IOS_ENABLED=false                    # iOS 需 StoreKit IAP，默认关
VITE_DONATE_NATIVE_READY=false                   # Android 原生支付，后端对账接口未落地前必须关
VITE_ADMIN_ENABLED=false                         # 内置管理后台入口，生产构建强制关
```

**所有 `import.meta.env.*` 的读取必须收口到 `src/utils/env.ts`**，不要在业务代码里裸写。配置校验分两层：`env.ts` 运行期 `console.error` 告警，`vite.config.ts` 的 `checkApiBaseUrl()` / `checkAdminGate()` 在构建期直接拦截。

包管理器**统一用 npm**（只保留 `package-lock.json`），不要再引入 `pnpm-workspace.yaml`。

## 自检命令

```bash
npm run type-check   # vue-tsc --noEmit
npm run lint         # eslint .
npm run build:app    # App 资源构建，产物 dist/build/app
```

## 管理后台

`src/pages/admin/` 是内置的调试后台，**不随 C 端发布包开放**：

- 入口由 `src/utils/env.ts` 的 `ADMIN_ENABLED` 控制，默认关闭
- `npm run build:app`（production）在 `vite.config.ts` 的 `checkAdminGate()` 里强制置 `false`
- 后台 token 存 `fans:admin:*`，与 C 端用户的 `fans:auth:*` **物理隔离**，不要复用 `utils/storage.ts` 的 `setTokens`
- 后台请求走 `utils/adminToken.ts` 的 `adminRequest`，不带用户 token、不触发用户会话 refresh

## 上线前必做

1. `src/manifest.json` 的 `appid` 替换为真实 DCloud AppID（当前是占位符，无法真机打包）。
2. `src/pages/admin/` 未从包内移除（`pages.json` 无法按 mode 条件编译）。已通过构建期开关封死入口，但要彻底消除需后端对 `/admin/*` 加来源校验，并把后台迁到独立 Web 控制台。
3. 隐私政策正文已与 App 实际采集数据对齐（不再声明微信 openid / unionid），上架前仍需人工复核一遍 `privacyDescription` 与实际 SDK 采集行为是否一致。
4. Android 原生支付仍是 stub，`VITE_DONATE_NATIVE_READY` 保持 `false`，等后端 `/donations/wx-app`、`/donations/alipay` 的对账接口落地后再开。