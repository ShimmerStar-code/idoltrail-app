# idoltrail-app

偶像轨迹（idoltrail）Android / iOS 独立 App 前端。基于 uni-app（Vue 3 + TypeScript + Vite）构建，与微信小程序版 `idoltrail-wechat` 并存、互不影响，两者共用 `idoltrail-server-main` 后端。

## 环境要求

- HBuilderX 5.x（编译器版本须与 `package.json` 中 `@dcloudio/*` 的 `3.0.0-4080420251103001` 一致）
- Node.js 18+
- DCloud 开发者账号（取 AppID 与 uni-push 配置；不配也能编译运行，只是推送走 no-op）

## 快速开始

```bash
npm install

# 配置环境变量：手机/模拟器访问不到 localhost，必须填局域网或公网地址
cp .env.example .env
# 编辑 .env，把 VITE_API_BASE_URL 改成后端真实地址

# HBuilderX 导入本目录 → 运行到 Android / iOS
# 或用 CLI：
npx uni -p app-android
npx uni -p app-ios
```

后端已部署到测试服务器 `103.24.218.69:8081`，手机与本机均可直连，`.env` 默认即指向该地址。

只有在本地用 WSL 起后端服务时才需要改地址：Windows 侧 `localhost:8081` 转发不通，用 `wsl hostname -I` 查 WSL IP 填进 `.env`。后端部署方式见 `../idoltrail-server-main/DEPLOY.md`。

产物目录：

| 命令 | 产物路径 |
|------|----------|
| `npm run build:app` | `dist/build/app` |

## 自检命令

```bash
npm run type-check   # vue-tsc --noEmit
npm run lint         # eslint .
npm run build:app    # App 资源构建
```

## 架构要点

### 登录：手机号 + 短信验证码

App 端没有微信的免密登录，也拿不到 `getPhoneNumber` 授权：

```
LoginModal → authApi.sendSms → authApi.phoneLogin → userStore.loginWithPhone
```

未注册手机号自动注册。后端契约：`POST /auth/sms/send`、`POST /auth/phone-login`、`POST /auth/refresh`。「账号管理」页的手机号是登录凭证本身，只能更换，没有解绑。

### 导航栏

App 端没有微信胶囊按钮，`src/utils/system.ts` 统一提供尺寸：

```ts
const { statusBarHeight, navBarHeight, navRightPadding } = getNavBarMetrics()
```

不要使用 `uni.getMenuButtonBoundingClientRect()`（小程序专属，App 上会失败）。

### TabBar

`pages.json` **不声明原生 tabBar**，改由页面内 `<TabBar>` 自绘，切换走 `switchTabPage()`（`navigateBack` → `reLaunch` 兜底），目的是保留页面状态并避免与自绘栏重复。

### 全局浮层

`LoginModal` / `PrivacyPopup` / `DisclaimerPopup` / `NotificationPromptModal` 由 `PageLayout` 在每个页面挂载一次（`App.vue` 的 template 不渲染）。**新页面务必用 `<PageLayout>` 包裹。**

弹窗打开期间的错误提示一律内联展示，不用 `uni.showToast` —— popup 的 mask 是 `z-index: 9999`，会完全遮住 H5 的 `uni-toast`（999）。相关请求在 `src/api/auth.ts` 里传 `silent: true`，`request.ts` 据此只 reject 不弹 toast。

### 订阅与推送

App 端系统推送是**长期订阅**，没有小程序「一次授权一次推送」的配额语义：

1. 用户点订阅 → `subscribeStore.toggleArtist/toggleEvent`
2. 成功后 `notificationStore.requestSystemNotifyPermission()` 拿系统通知权限
3. 拿到权限后 `syncPushToken()` 上报 cid 到后端
4. 后端按订阅关系推送；通知点击按 `relatedType` / `relatedId` 跳详情页

`syncPushToken()` 幂等，调用点有四类：

- App `onLaunch` / `onShow`（厂商通道冷启动后 cid 才稳定）
- 登录成功后（`stores/user.ts`）
- 用户在 artist / event 详情页或列表页**订阅成功且已授予系统通知权限**时
  （`artist/list.vue`、`artist/detail.vue`、`artist/by-country.vue`、`event/detail.vue`）
- 通知授权弹窗确认后（`components/NotificationPromptModal`）

## 后端接口一览

前端实际调用的路径（前缀 `VITE_API_BASE_URL`，含 `/api/v1`）：

```
认证      /auth/sms/send  /auth/phone-login  /auth/refresh  /auth/logout
          /auth/logout-all  /auth/agreement
用户      /user/me  /user/cancel  /user/cancel/revoke
          /user/avatar/upload  /user/devices  /user/devices/:id
          /user/devices/push-token  /user/login-logs
订阅      /subscriptions/{artists,cities,events}[/:id]
          /subscriptions/artists/related-events
          /subscriptions/cities/:id/related-events
通知      /notifications  /notifications/unread  /notifications/read
          /notifications/read-all  /notifications/:id/read
          /notifications/settings
内容      /artists  /artists/grouped  /artists/:id
          /events  /events/:id  /events/:id/like  /events/cities
          /events/calendar-counts  /regions  /dictionaries/:kind
搜索      /search/artists  /search/events  /search/places
捐赠      /donations  /donations/xpay/sign  /donations/:outTradeNo
```

`/user/phone/bind`、`/user/phone/unbind` 是微信小程序 `getPhoneNumber` 的接口，App 端已不再调用（保留在 `src/api/user.ts`）。

## 目录结构

```
src/
├── api/          # 接口封装，统一走 utils/request.ts（admin 走 utils/adminToken.ts）
├── components/   # 公共组件，PascalCase
├── composables/  # usePush（uni-push）/ useNotificationSocket
├── constants/    # cities / genres / eventMeta / agreements
├── pages/        # 页面，PageLayout 包裹；分包含 event/place/search/agreement/admin
├── stores/       # Pinia store
├── types/        # 接口响应类型
└── utils/        # env / request / adminToken / privacy / location / share / system / pages / device
```

## 包管理器

**统一用 npm**，锁文件只有 `package-lock.json`。仓库不再保留 `pnpm-workspace.yaml` —— 两套包管理器并存会让不同机器装出不同的依赖树。

## 环境变量

| 变量 | 说明 |
|------|------|
| `VITE_API_BASE_URL` | 后端根地址，**必填**，含 `/api/v1`。生产构建缺失或指向 localhost 时 `vite.config.ts` 会直接 fail build |
| `VITE_PUSH_ENABLED` | uni-push 2.0 开关，默认 `false`；关闭或插件缺失时为 no-op |
| `VITE_DONATE_ENABLED` | 捐赠入口总开关 |
| `VITE_DONATE_IOS_ENABLED` | iOS 需走 StoreKit IAP，默认 `false` |
| `VITE_DONATE_NATIVE_READY` | Android 原生支付是否就绪，默认 `false` |
| `VITE_ADMIN_ENABLED` | 内置管理后台入口，默认 `false`，生产构建强制关闭 |

所有变量的读取统一收口在 `src/utils/env.ts`，不要在业务代码里裸写 `import.meta.env.*`。

## 上线前必须补齐

### 1. DCloud AppID（阻塞项）

`src/manifest.json` 中 `"appid": "__UNI__REPLACE_WITH_DCLOUD_APPID__"` 需替换为真实 `__UNI__XXXXXXX`。未替换可编译，但**无法真机运行与打包**。

### 2. 推送（默认关闭）

```bash
VITE_PUSH_ENABLED=true
```

补齐步骤：HBuilderX 安装 `uni_modules/uni-push`（uni-push 2.0）→ DCloud 后台开通 UniPush / 厂商通道 → `manifest.json` 的 `app-plus.distribute.sdkConfigs` 填渠道 AppID/Secret → Android 厂商通道按需在 `app-plus.modules` 启用。

`src/composables/usePush.ts` 全部走可选调用，插件缺失或开关关闭时是 no-op，**不补齐不影响编译与运行**。

### 3. 第三方分享（可选）

`manifest.json` 的 `app-plus.modules.share` 已启用，落地需在 `sdkConfigs` 填微信/QQ/微博 AppID。未配置时 `shareApp()` 走系统分享面板。`src/utils/share.ts` 当前**无页面调用**，属预留能力。

### 4. 支付

`src/pages/profile/donate.vue` 的 iOS 链路已接 StoreKit IAP（`requestAppleIAP` → `donateApi.verifyAppleIAP`），由三个开关串联控制：

| 开关 | 作用 |
|------|------|
| `VITE_DONATE_ENABLED` | 捐赠入口总开关，关闭时入口完全隐藏 |
| `VITE_DONATE_IOS_ENABLED` | iOS 是否展示支付按钮（App Store 要求数字内容走 IAP） |
| `VITE_DONATE_NATIVE_READY` | Android 原生支付（微信 App Pay / 支付宝）是否可用 |

**Android 侧目前保持 `VITE_DONATE_NATIVE_READY=false`**：`invokeNativePay()` 仍是 stub，而后端 `/donations/wx-app`、`/donations/alipay` 尚未落地对账接口，此时置 true 只会让用户点了必然失败。后端就绪后再开。

### 5. 隐私合规

`src/constants/agreements.ts` 已与 App 实际采集数据对齐（不再声明微信 openid / unionid），隐私政策正文由此常量渲染。

`src/utils/privacy.ts` 维护「已同意 + 协议版本」状态：未同意前 `ensureSystemPermission()` 会拦截定位、通知等授权调用；协议变更时递增 `PRIVACY_VERSION`，App 启动会重新征求同意。权限用途文案在 `manifest.json` 的 `privacyDescription` / `android.permissions`。上架前仍需人工复核一遍与实际 SDK 采集行为是否一致。

### 6. 管理后台入口（安全）

`src/pages/admin/` 是内置的调试用后台，**不随 C 端发布包开放**：

- 默认关闭，需在 `.env` 显式设 `VITE_ADMIN_ENABLED=true` 才能访问
- `npm run build:app`（mode=production）在 `vite.config.ts` 的 `checkAdminGate()` 里强制把该开关按死为 `false`
- 后台 token 存 `fans:admin:*`，与 C 端用户 token（`fans:auth:*`）物理隔离，避免误伤用户登录态
- 后台请求走 `utils/adminToken.ts` 的 `adminRequest`，不带用户 token、不触发用户会话 refresh

即便如此，生产包内仍含 admin 页面代码（`pages.json` 无法按 mode 条件编译）。彻底方案是后端对 `/admin/*` 加来源校验 / 独立域名，后台管理迁到独立 Web 控制台。

## 与小程序版的关系

两端代码**不共享**，`idoltrail-app` 是独立工程。唯一交集是后端 API。后端自 `0043` 迁移起支持双通道：`user_auths.identity_type` 区分 `phone` / `wx_mini`，`user_notification_settings` 的 `push_enabled` 与 `wechat_enabled` 双开关隔离，App 提交 `push_*` 不会覆盖小程序侧设置。