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
- 微信小程序由**独立代码库**维护，不在本工程内编译，详见 CLAUDE.md 顶部说明。
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

### 一键登录（uni univerify）

登录页**不放一键登录按钮**，交互链路：

```
LoginModal 打开 → preLoginOneKey() 后台探测（成功才可能在勾选协议后弹授权页）
用户勾选《用户协议》《隐私政策》 → requestOneKeyAuth() 自动弹出运营商授权页
→ authApi.oneKeyLogin → userStore.loginWithOneKey
```

- **协议勾选是一键登录的硬门槛**，由 `toggleAgree()` 触发拉起；探测与勾选互为兜底触发点
  （探测先回 → 勾选时弹；勾选先回 → 探测成功时补弹），`oneKeyAutoTriggered` 保证只弹一次
- 手机号由服务端经 uniCloud 云函数换取，**客户端拿不到也不传手机号**；
  换出的是 `user_auths.identity_type='phone'` 的**同一个账号**，与短信登录互通
- **能力不可用时整段静默降级**。无 SIM 卡、未开移动数据、机型不支持、服务未开通时
  一键登录不参与，登录页只剩协议 + 手机号 + 验证码，探测失败不是错误，不给用户任何提示
- 状态文案全部走 `oneKeyHint` 内联提示（探测中 / 待勾选 / 取消后怎么回来），
  不用 `uni.showToast`（会被 popup mask 遮住）
- 用户关闭授权页 → 不报错，置 `oneKeyCancelled` 停止自动重试；**取消勾选再勾上**可重来一次
- 后端 `40027` → 永久隐藏一键登录；`40028` → 提示「改用短信验证码登录」
- 一键登录**必须走移动数据**，Wi-Fi 下取不到本机号码，UI 文案不要误导
- `src/manifest.json` 的 `app-plus.modules` 必须含 `"OAuth": {}`，
  且要用**包含该模块的自定义基座或云打包**安装才有该能力
- H5 / 小程序端 `isOneKeyLoginSupported()` 恒 false，`#ifdef APP-PLUS` 与
  `#ifndef APP-PLUS` 两个分支都要写全（vue-tsc 直接检查源文件，两条分支都过一遍）
- 改一键登录交互时，`src/constants/agreements.ts` 的 v1.4 隐私政策正文要同步，
  文案里不能再出现已删除的「点击『本机号码一键登录』」表述（合规红线：政策须与实际行为一致）

### 请求层

页面**不得**直接调用 `uni.request`，一律走 `src/utils/request.ts`。

`request.ts` 的 `RequestOptions` 有 `silent?: boolean`：

- `silent: true` → 业务失败时**不弹全局 toast**，只 `reject`
- 用于「弹窗打开期间」的场景，此时自定义弹窗的 mask（`z-index: 9999`）会完全遮住 H5 的 `uni-toast`（`z-index: 999`），表现为「日志有错、界面没反应」
- **非静默时依然弹 toast**，全局兜底不丢

业务失败 reject 的 `Error` 上带 `code`（后端 errno，见 `bizError()`）。
需要按错误类型分流的调用方读 `e.code`，**不要再匹配文案**（后端改文案就失效）。

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

命名规范为 **`.env.dev` / `.env.prod`** 两份对称配置，**字段集合必须完全一致**（仅取值不同），
由 `npm run check:env` 在构建期校验（单边字段、非 `VITE_` 变量、UTF-8 BOM 都会被拦下）：

| 文件 | 入库 | 说明 |
|------|------|------|
| `.env.dev` / `.env.prod` | 是 | 构建配置，只允许 `VITE_*`，UTF-8 无 BOM |
| `.env.dev.local` / `.env.prod.local` | 否 | 个人覆盖，优先级高于同名文件 |
| `.env` | 否 | **不是给 Vite 用的**，是 uniCloud 云函数的环境变量（见下） |

```bash
VITE_API_BASE_URL=http://103.24.218.69:8081/api/v1   # 测试服务器；必填，生产构建缺失或指向 localhost 会 fail build
VITE_PUSH_ENABLED=false                          # uni-push 开关
VITE_DONATE_ENABLED=false                        # 捐赠入口总开关
VITE_DONATE_IOS_ENABLED=false                    # iOS 需 StoreKit IAP，默认关
VITE_DONATE_NATIVE_READY=false                   # Android 原生支付，后端对账接口未落地前必须关
VITE_ADMIN_ENABLED=false                         # 内置管理后台入口，生产构建强制关
VITE_APPLE_LOGIN_ENABLED=false                   # Apple 登录入口，默认关（见「一键登录」章节的启用条件）
```

npm scripts 已带 `--mode=dev` / `--mode=prod`。**HBuilderX GUI 的运行/发行不经过 CLI**，
它写死用 `development` / `production` 这两个 mode，因此 `vite.config.ts` 里的
`MODE_ALIAS` 把它们映射到 `dev` / `prod`，保证 GUI 与 CLI 两条入口都能读到配置。

判定「是否生产构建」必须用 `isProduction(mode)`（看 `NODE_ENV` + 归一后的 mode），
**不要写 `mode === "production"`** —— 改用 `--mode=prod` 后那种写法恒为假，
`checkAdminGate()` 会静默失效，管理后台入口会直接打进 C 端发布包。

根目录 `.env` 的文件名是 DCloud 的约定，不能改：HBuilderX 本地运行
`univerify-exchange` / `unipush-send` 时会把它作为云函数环境变量注入。
里面的 `UNIVERIFY_SECRET` / `UNIPUSH_SECRET` 必须与 Go 后端一致。
Vite 也会加载该文件，但只取 `VITE_` 前缀，而这些变量没有该前缀，所以对构建无影响。

**所有 `import.meta.env.*` 的读取必须收口到 `src/utils/env.ts`**，不要在业务代码里裸写。配置校验分两层：`env.ts` 运行期 `console.error` 告警，`vite.config.ts` 的 `checkApiBaseUrl()` / `checkAdminGate()` 在构建期直接拦截。

包管理器**统一用 npm**（只保留 `package-lock.json`），不要再引入 `pnpm-workspace.yaml`。

## 后端

Go 服务在 `../idoltrail-server-main`，当前对接的测试服务器为 `103.24.218.69`（香港，**Docker Compose 单容器**，无 systemd 单元、无裸二进制部署）。部署一律走 `deploy/test-server.sh` 或打 tag 触发 GitHub Actions；服务器信息、部署方式、回滚步骤见 `../idoltrail-server-main/DEPLOY.md`；业务与 API 规范见同目录 `CLAUDE.md`。

一键登录的手机号换出链路横跨两端（App → 本服务 → uniCloud 云函数），改任一侧都要同步另一侧，密钥必须三处一致。

## ⛔ 服务器红线：禁止修改 47.94.165.221

平台有两台后端，**只有一台允许改**：

| 主机 | 定位 | 允许的操作 |
|------|------|-----------|
| `103.24.218.69`（香港） | **测试服务器** | 可部署、可改代码、可重启服务 |
| `47.94.165.221`（阿里云） | **线上正式服务器** | **仅只读排查** |

`47.94.165.221` 同时是 `idoltrail.com` / `apitest.idoltrail.com` / `admintest.idoltrail.com` 的解析目标，承载生产流量与生产数据库。

**禁止对该主机的任何写操作**：部署、发布、`docker compose up/down/restart`、`docker build/load`、改 `/home/dev/**` 下任何文件、改或重载 Nginx/容器/systemd、执行 `../idoltrail-server-main/scripts/` 下的任何脚本（**它们全部以 221 为目标**）。

允许的只有只读排查：`ls`、`cat`、`docker ps`、`docker inspect`、`systemctl status`、`ss -lntp`、`curl` 只读探测。

**未经用户逐次明确授权，不得以任何理由写入该主机。** 若误改，立即停止、用备份回滚并知会负责人。

> 已发生过一次误部署：admin-web 曾按 `scripts/upload-and-deploy.sh` 里的 `SERVER="47.94.165.221"` 被部署到正式机（该脚本会清空并覆盖 `/home/dev/idoltrail-admin`），已从备份 `/home/dev/idoltrail-admin.bak.<ts>` 回滚。**不要照搬脚本里的主机常量，先确认该主机定位。**

测试前端 admin-web 部署在 **`103.24.218.69`** 的 Nginx（`http://103.24.218.69/`，站点配置 `/etc/nginx/sites-available/idoltrail-admin`，站点文件 `/home/dev/idoltrail-admin`，`/api/` 反代 `127.0.0.1:8081`），连的是 69 的后端。

## 推送（uni-push 2.0）

- `manifest.json` 勾选 `Push` 模块 + `sdkConfigs.push.unipush{version:"2",offline:true}` 即完成集成，**不需要把 uni-push 放进 `src/uni_modules`**，HBuilderX 构建时内置 SDK 会带上。
- 取 cid 走 `uni.getPushClientId()`，拿到后经 `/api/v1/user/devices/push-token` 上报后端。
- **服务端下发必须经 uniCloud 云函数**（官方只有 `uni-cloud-push` 扩展库），自建 Go 服务无法直连，也**不存在 AppKey**。详见 `../idoltrail-server-main/CLAUDE.md` 的 uni-push 章节。
- 点击跳转由本端解析 `payload` 处理：`resolvePushUrl()` 支持 `payload.url` 直达，
  或 `relatedType` + `relatedId` 组合（与站内通知路径约定一致）。后端传的 `ClickURL` 会落在 `payload.url`。
- 真机验证必须用**含 uni-push 模块的自定义基座或云打包**安装，标准 HBuilder 运行基座收不到推送。
- `offline:true` 还需在 DCloud 后台配置厂商通道（华为/小米/OPPO/vivo），未配置时 App 被回收后基本收不到。
- `stores/user.ts` ↔ `composables/usePush.ts` 的循环依赖已断开：后者改为
  `await import('@/stores/user')` 惰性引入。新增代码保持这个结构，不要在顶部静态 import。

## 依赖版本锁定

本项目的 Vue 版本**必须精确锁定**，不能用 `^`：

- `vue` 与 `@vue/runtime-core` 锁 `3.4.21`，`pinia` 锁 `2.2.4`。
- 原因：`@dcloudio/*` 全家桶把 `@vue/shared` 声明为 **dependencies**（不是 peer）且钉在 `3.4.21`，
  会被提升到顶层；而 `^3.4.21` 会解析到 3.5.x，Vite 的 dedupe 于是让
  `@vue/runtime-core@3.5.x` 拿到 `@vue/shared@3.4.21`，
  编译直接失败：`"normalizeCssVarValue" is not exported by "@vue/shared"`。
- `pinia@2.2.6+` 的 peer 要求 `vue ^3.5.11`，2.2.4 是最后一个兼容 3.3+ 的版本。
- 改版本后必须清 `node_modules/.vite` 并重启 HBuilderX 的运行进程，
  Vite 依赖图只在进程启动时解析，热更新不会生效。

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

1. `src/manifest.json` 的 `appid` 已是真实 DCloud AppID `__UNI__F1F9279`（已与 DCloud 后台核对），**不要再改成占位符**。
2. `src/pages/admin/` 未从包内移除（`pages.json` 无法按 mode 条件编译）。已通过构建期开关封死入口，但要彻底消除需后端对 `/admin/*` 加来源校验，并把后台迁到独立 Web 控制台。
3. 隐私政策正文已与 App 实际采集数据对齐（不再声明微信 openid / unionid），上架前仍需人工复核一遍 `privacyDescription` 与实际 SDK 采集行为是否一致。
4. Android 原生支付仍是 stub，`VITE_DONATE_NATIVE_READY` 保持 `false`，等后端 `/donations/wx-app`、`/donations/alipay` 的对账接口落地后再开。
5. 一键登录依赖 3 件外部条件，缺一则入口静默消失（不会崩，但功能等于没上线）：
   DCloud 后台已为 `__UNI__F1F9279` 开通一键登录服务、云函数 `univerify-exchange`
   已上传并 URL 化、后端已填 `UNIVERIFY_*`。真机验证必须用**含 OAuth 模块的基座或云打包**，
   且设备处于移动数据下。