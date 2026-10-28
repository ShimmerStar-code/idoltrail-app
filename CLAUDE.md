# idoltrail-app — Android / iOS 独立 App 前端

演唱会 / 音乐活动信息平台的 **App 端**。uni-app + Vue 3 + TypeScript。

## 技术栈

- uni-app（`@dcloudio/*` 3.0.0-5020620260917001，编译器 5.26）+ Vue 3 + TypeScript
- Pinia 状态管理
- uview-plus **未使用**；UI 组件走 `@dcloudio/uni-ui` 的 easycom
- 构建：Vite 5 / HBuilderX CLI

## 关键约定

### 平台

- 目标平台只有 **App（Android / iOS）**，H5 仅为开发调试用。
- 条件编译一律用 `#ifdef APP-PLUS` / `#ifndef APP-PLUS`，**全仓不存在 `#ifdef MP-WEIXIN`**。
- 微信小程序由**独立代码库**维护，不在本工程内编译，详见 CLAUDE.md 顶部说明。
- 不要引入 `uni.getMenuButtonBoundingClientRect()`（小程序专属），导航栏尺寸统一走 `src/utils/system.ts` 的 `getNavBarMetrics()`。

### 隐私弹窗：首启的「同意」发生在原生层，不是自绘弹窗

uni-app 的 **JS 启动比原生晚**，三方 SDK（uni-push / 厂商通道 / WebView 内核）在**原生插件加载时**
就读取 OAID、Android ID、安装列表。若只在 JS 里自绘弹窗，采集必然早于弹窗 →
国内商店判「未经用户同意即收集个人信息」（已真实被打回过，见 `docs/app-store-review.md`）。

**正确链路（不要改回去）**：

| 层 | 做法 |
|----|------|
| 原生 | `src/androidPrivacy.json` 的 `prompt: "template"`：原生模板弹窗在 splash 阶段挡住应用，**用户点同意后才加载原生插件**。`disagreeMode.support=false` + `loadNativePlugins=false` + `backToExit="true"` |
| JS | 启动读 `plus.runtime.isAgreePrivacy()`（`utils/privacy.ts` `isNativePrivacyAgreed()`）：**原生已同意 → 同步本地状态，不再弹自绘弹窗**（自绘弹窗晚于 SDK 初始化，会让检测引擎误判） |
| JS | 降级路径（原生弹窗未生效）：自绘弹窗同意 → `plus.runtime.agreePrivacy()`，拒绝 → `disagreePrivacy()`（`syncNativePrivacyAgree/Disagree()`） |
| 资源 | 原生弹窗的协议链接指向包内 `static/privacy.html` / `static/user-agreement.html`，由 `npm run export:agreements` 与 `constants/agreements.ts` **同源生成** |

> DCloud 官方口径：<https://uniapp.dcloud.net.cn/tutorial/app-privacy-android.html>
> 「目前设置 custom 模式策略，并不能完全避免在弹出隐私提示框之前读取设备信息……
> 碰到此问题的开发者请先使用 template 模式解决」。

### 权限：必须由用户主动触发才申请

- **定位**：首页与首屏**只走 IP 粗定位**（不申请任何系统权限）；
  精确位置权限**只有**用户点「城市选择器 → 重新定位」时申请（`location.ts` 的 `precise: true`）。
  首启 / 进首页就弹位置授权框会被判「强制、频繁、过度索取权限」。
- 通知、相册、相机同理由用户主动操作触发。
- `manifest.json` 不申请 `READ_PHONE_STATE`。

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
- 改一键登录交互时，`src/constants/agreements.ts` 的隐私政策正文要同步，
  文案里不能再出现已删除的「点击『本机号码一键登录』」表述（合规红线：政策须与实际行为一致）

### 隐私政策 / 用户协议（服务端统一下发）

协议正文的**权威来源是服务端**，App 内置的那份只是离线兜底：

| 层 | 位置 | 作用 |
|----|------|------|
| 包内兜底 | `src/constants/agreements.ts` | 断网 / 后端未部署时用；同时是导出来源 |
| 服务端 | `GET /api/v1/public/agreements` | 运行时权威来源，返回正文 + 版本号 |
| 本地缓存 | `fans:agreements:cache` | 缓存服务端正文，下次启动离线可用 |

- **版本号强制锁定 `v1.0.0`，不递增**。三处硬约束：
  1. 服务端 `content.json` 是「当前生效版本」的唯一真源，登录时用它查 `user_agreements`
     签署记录，App 上报版本必须与服务端**完全一致**，否则查不到那条记录 →
     表现为「每次登录都判定未签协议并要求重新勾选」（这条链路历史上踩过一次）；
  2. `user_agreements` 唯一键是 `(user_id, agreement_type, version)`，版本漂移 = 历史记录全部失配；
  3. 递增版本会让存量用户的隐私同意失效（`hasPrivacyConsent` 比对「当前生效版本」），
     下次启动集体重新弹窗。

  **正文可以修订，版本号不动。** 要改版本 = 显式声明「协议版本变更」，必须同时改
  `src/constants/agreements.ts` 的 `PRIVACY_VERSION` / `AGREEMENT_VERSION`、
  `src/androidPrivacy.json` 的 `version`、后端 `internal/agreements/content_test.go`
  的 `lockedVersion`，并重跑导出。
- **版本号是唯一的刷新判据**：`src/utils/agreementContent.ts` 的 `compareVersion()`，
  只有服务端版本**严格高于**当前生效版本才替换正文；相同或更低一律忽略（防回滚）。
- 启动时 `src/App.vue` 的 `onLaunch` 调 `syncAgreementsFromServer()`：
  **不 await、不阻塞启动**，失败静默降级到包内版本（`silent: true`，不弹 toast）。
- 生效版本 = 服务端版本 > 包内版本时用服务端，否则用包内。
  对外统一走 `getEffectiveAgreement()` / `getEffectiveVersion()`，**不要直接读常量**。
- 同意状态比较的是**生效版本**（`src/utils/privacy.ts`），不是包内常量：
  服务端发了新隐私政策 → 旧版本同意失效 → `invalidatePrivacyConsent()` → 重新弹
  `PrivacyPopup`（reason = `policy_updated`）。用户同意后存的是当前生效版本。
- 协议详情页、隐私弹窗、登录弹窗上报给后端的版本号都取生效版本，
  后端据此判断 `missing_agreements`（用户协议补签走这条既有链路）。
- **改了 `src/constants/agreements.ts` 必须跑 `npm run export:agreements`**，
  把正文同步到 `../idoltrail-server-main/internal/agreements/content.json`；
  后端 `go:embed` 编译进镜像，**不导出 + 不重新部署后端，线上正文不会变**。
- **`npm run check:agreements` 是版本锁 + 三处同源的守卫**（CI 已接入）：
  版本号必须是 `v1.0.0`；包内 `src/static/*.html`（原生弹窗落地页）必须与正文同源；
  有后端仓时还会逐字比对服务端 `content.json`。
  渲染逻辑在 `scripts/lib/agreements.mjs`，导出与校验共用同一份，避免两边漂移。
- 政策正文的红线：不写内部字段名、双令牌机制、密钥管理、源码路径、
  不存在的 UI 入口；但法定 SDK 名称、包名、权限、用途、隐私链接、采集字段、存储期限必须保留。
  改 SDK 清单时按 DCloud 官方口径写全包名
  （`io.dcloud` 基础模块、`com.igexin`、`com.zx`、`com.bun.miitmdid`、
  `com.zui.opendeviceidlibrary`、`com.netease.nis`、`com.samsung.android`、`com.huawei.hms`）。

#### 协议正文的四处快照与发布顺序

**「服务端统一下发」实际只下发了版本号；正文是四份各自构建期的快照。**
`getEffectiveAgreement()` 只在服务端版本**严格高于**包内版本时才采用服务端正文，
而两端都锁在 `v1.0.0` → 比较结果恒为 0 → **服务端正文永远不生效**。
所以正文一致性靠**发布**保证，不靠运行时拉取。

| 快照 | 载体 | 什么时候生成 | 改正文后如何生效 |
|------|------|------------|----------------|
| App 包内 | `src/constants/agreements.ts` + `src/static/*.html` | `npm run build:app` | 重新打包 App（已上架则需重新提审） |
| 服务端 | `../idoltrail-server-main/internal/agreements/content.json`（`go:embed`） | `npm run export:agreements` + 重新构建镜像 | 部署后端：`release-v2.yml` → 只重建 `api2` 容器 |
| 生产官网 | `www.idoltrail.com/privacy` | 官网 `npm run build`（从 App 仓真源导出） | 部署官网：`idoltrail-web/scripts/install-prod-site.sh` |
| 运营后台 | `admin.idoltrail.com/privacy` | 运行时读 v2 API | 跟随 v2 API 发布 |

**改协议正文的发布顺序**（漏一步就是「网页版与 App 不一致」，商店会以此打回）：

1. 改 `src/constants/agreements.ts`（**版本号不动**，只改正文）
2. `npm run export:agreements` → 同步服务端 `content.json` + 包内静态 HTML
3. `npm run check:agreements` → 版本锁 + 三处同源守卫
4. **先提交 App 仓**：官网 CI 会 checkout App 仓 main 取正文，
   **App 仓不先提交，官网 CI 会构建出旧正文**（`source_hash` 断言仍会通过，因为它比的是自洽性）
5. 提交服务端仓 → 触发 `release-v2.yml`（`ref` 指向含新 `content.json` 的提交）→ 只重建 `api2`
6. 构建并部署生产官网 → 冒烟里「协议页与发布包逐字一致」通过才算完成
7. 复验四处正文一致（发布日期 / 字节数 / 关键条款）

> **官网发布必须 `--force-recreate` nginx**：站点目录是整份替换（inode 变了），
> 而容器里的 bind mount 绑的是旧 inode；compose 配置没变时 `up -d nginx` 会 no-op，
> 脚本全绿、冒烟也过，线上返回的还是上一版正文。已修进 `install-prod-site.sh`。

**商店审核的隐私政策 URL 只能是 `https://www.idoltrail.com/privacy`**：

- `https://idoltrail.com/privacy` 是**生产正式栈**的后台页，其 API 指向
  `apitest.idoltrail.com`（正式栈，**禁改红线**），而正式栈没有 `/public/agreements` 路由
  → 页面正文空白。不要提交这个 URL。
- `https://api.idoltrail.com/api/v1/public/agreements` 返回 JSON，只适合机器抓取。


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
VITE_API_BASE_URL=http://103.24.218.69:8081/api/v1   # .env.dev：测试服务器；必填，生产构建缺失或指向 localhost 会 fail build
                                                # .env.prod：https://api.idoltrail.com/api/v1（v2 隔离栈）
```

开关字段的实际取值（**dev / prod 两列都要照抄当前 .env 文件**，下表随文件改动同步更新）：

| 字段 | `.env.dev` | `.env.prod` | 说明 |
|------|-----------|------------|------|
| `VITE_PUSH_ENABLED` | `true` | `true` | uni-push 2.0 总开关；关掉则只剩应用内通知 |
| `VITE_DONATE_ENABLED` | `true` | `false` | 捐赠入口总闸，关闭时入口整个隐藏 |
| `VITE_DONATE_IOS_ENABLED` | `false` | `false` | iOS 需 StoreKit IAP，默认关 |
| `VITE_DONATE_NATIVE_READY` | `false` | `false` | Android 原生支付，后端对账接口未落地前必须关 |
| `VITE_ADMIN_ENABLED` | `false` | `false` | 内置管理后台入口，生产构建再被 `checkAdminGate()` 按死一次 |
| `VITE_APPLE_LOGIN_ENABLED` | `false` | `false` | Apple 登录入口，默认关（见「一键登录」章节的启用条件） |

> ⚠️ `.env.dev` 的 `VITE_DONATE_ENABLED=true` 只在 `VITE_DONATE_NATIVE_READY=true` 时才有意义：
> 后者关着时（当前状态，后端对账接口未落地）Android 端进 donate 页会看到「通道未开通」，
> 属于开发期已知状态，**不要**据此以为捐赠链路已通。

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

> 例外：`api.idoltrail.com` / `admin.idoltrail.com` 是该主机上的 **v2 隔离栈**独立 vhost
> （`/api/` → `idoltrail-backend-api2`，`/` → `idoltrail-admin-v2`），
> 数据落在独立库 `idoltrail`（容器 `idoltrail-mysql2`），与生产库无交集。
> 对 `/home/dev/idoltrail-backend-v2/`、`/home/dev/idoltrail-admin-v2/` 的写操作已获逐次授权，
> 但**不得触碰**同机上的生产目录、生产容器与生产 nginx 站点。
> App 的生产包（`.env.prod`）当前指向 `https://api.idoltrail.com/api/v1`，即这条 v2 通道。

允许的只有只读排查：`ls`、`cat`、`docker ps`、`docker inspect`、`systemctl status`、`ss -lntp`、`curl` 只读探测。

**未经用户逐次明确授权，不得以任何理由写入该主机。** 若误改，立即停止、用备份回滚并知会负责人。

> 已发生过一次误部署：admin-web 曾按 `scripts/upload-and-deploy.sh` 里的 `SERVER="47.94.165.221"` 被部署到正式机（该脚本会清空并覆盖 `/home/dev/idoltrail-admin`），已从备份 `/home/dev/idoltrail-admin.bak.<ts>` 回滚。**不要照搬脚本里的主机常量，先确认该主机定位。**

测试前端 admin-web 部署在 **`103.24.218.69`** 的 Nginx（`http://103.24.218.69/`，站点配置 `/etc/nginx/sites-available/idoltrail-admin`，站点文件 `/home/dev/idoltrail-admin`，`/api/` 反代 `127.0.0.1:8081`），连的是 69 的后端。

v2 隔离环境的 admin-web 部署在同机的 v2 vhost（`https://admin.idoltrail.com/` 为后台主入口，`https://api.idoltrail.com/` 根路径也挂同一份，站点文件 `/home/dev/idoltrail-admin-v2/`，`/api/` 反代 `idoltrail-backend-api2`），连的是 v2 隔离库。

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

### 升级 @dcloudio/* 的正确姿势

**不要用 `npx @dcloudio/uvm@latest` 的默认 merge 流程。** 它按官方模板重写整个
`package.json`，对本工程有三重破坏：

- 写入 `vue: ^3.4.21` / `@vue/runtime-core: ^3.4.21`（caret）→ 解析到 3.5.x，
  直接踩上面那条 `@vue/shared` 编译失败。
- 引入 16 个 `uni-mp-*` 平台包 + `vue-i18n` + `@dcloudio/uni-automator` + `rollup`。
  本工程是 App-only（微信小程序在 `idoltrail-wechat` 独立代码库），这些包纯属体积与噪音。
- `@dcloudio/types` 会被写成 `^3.4.8`，而新 `uni-app` 的 peer 是**精确** `3.4.31`，
  `^` 会解析到 3.4.32 造成 peer 冲突。

正确做法：**手工精确 bump** `package.json` 里 8 个 `@dcloudio/*` 包到同一版本
（`uni-app` / `uni-app-plus` / `uni-components` / `uni-h5` / `uni-push` /
`uni-cli-shared` / `uni-stacktracey` / `vite-plugin-uni`），
`@dcloudio/types` 钉到与 `uni-app` peer 一致的精确版本，
`vue` / `@vue/runtime-core` / `pinia` 保持精确锁不动，然后 `npm install` + 清 `.vite` + 跑自检。

版本号与 HBuilderX 的对应关系（`@dcloudio/vite-plugin-uni` 的 `uni-app.compilerVersion` 字段）：

| npm 版本 | compilerVersion | 对应 HBuilderX |
|----------|-----------------|-----------------|
| `3.0.0-5020620260917001` | 5.26 | release 稳定版（当前） |
| `3.0.0-alpha-5030220261016001` | 5.32 | alpha 通道（对应 5.32.2026101609-alpha） |

`uvm` 只能识别**uni-app CLI 工程**（`package.json` 的 `devDependencies` 含
`@dcloudio/vite-plugin-uni`），在 `idoltrail-web`（纯 Vue3+Vite 官网）里跑会报
`Error: Invalid project`。真要用它查版本，`--project` **只能传绝对路径**
（`path.join` 相对 CWD 解析会失败）：

```bash
npx.cmd @dcloudio/uvm@latest --project "C:\Users\trunk\Desktop\shimmer-star\idoltrail\idoltrail-app" --manager manual
```

`--manager manual` 只打印解析出的目标依赖集，不改文件。官网 `idoltrail-web` 的依赖升级
用 `npm outdated` / `npx npm-check-updates`，不要用 uvm。

## 自检命令

```bash
npm run type-check   # vue-tsc --noEmit
npm run lint         # eslint .
npm run build:app    # App 资源构建，产物 dist/build/app
```

## 构建与发布

CI 与发版流程见 **[DEPLOY.md](./DEPLOY.md)**：推送触发构建与测试，打 `v*.*.*` tag 产出
可交付的 App 资源包 artifact（APK/IPA 仍由 DCloud 云打包出，CI 不碰服务器、不需要任何 Secrets）。

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
4. Android 原生支付的**客户端**已实现（`src/utils/nativePay.ts` 走 `uni.requestPayment`），
   缺的是后端 `/donations/wx-app`、`/donations/alipay` 的下单与对账接口，
   因此 `VITE_DONATE_NATIVE_READY` 保持 `false`。
5. 一键登录依赖 3 件外部条件，缺一则入口静默消失（不会崩，但功能等于没上线）：
   DCloud 后台已为 `__UNI__F1F9279` 开通一键登录服务、云函数 `univerify-exchange`
   已上传并 URL 化、后端已填 `UNIVERIFY_*`。真机验证必须用**含 OAuth 模块的基座或云打包**，
   且设备处于移动数据下。