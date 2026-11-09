# App 端 —— 构建与发布指南

> 仓库：`https://github.com/ShimmerStar-code/idoltrail-app.git`
> 技术栈与项目约定见 [CLAUDE.md](./CLAUDE.md)，本文只讲**怎么构建、怎么发版**。

---

## 1. 分发形态

App 的安装包通过 GitHub Actions 调用 HBuilderX CLI 云打包，链路是：

```
git push            → CI：环境校验 / lint / 类型检查 / 构建资源包（不发布）
git tag v*.*.*      → Release：复用 CI 门禁 → HBuilder CLI 云打包 APK
                    → 校验包名、版本与签名 → 转存 OSS/CDN
                    → 同步后台当前版本 → 创建 GitHub Release
应用商店审核        → 上架
```

普通提交不读取发布 Secrets，也不修改后台版本。只有 `v*.*.*`  tag 会进入发布流程。
DCloud 返回的临时地址不能直接录入后台，APK 必须先转存为永久公网地址。

---

## 2. 环境

| 文件 | 入库 | 说明 |
|------|------|------|
| `.env.dev` | 是 | `VITE_API_BASE_URL=http://103.24.218.69:8081/api/v1`（测试服） |
| `.env.prod` | 是 | `VITE_API_BASE_URL=https://api.idoltrail.com/api/v1`（v2 隔离栈） |
| `.env.dev.local` / `.env.prod.local` | 否 | 个人覆盖，优先级高于同名文件 |
| `.env` | 否 | **不是给 Vite 用的**，是 uniCloud 云函数的环境变量（`UNIVERIFY_SECRET` / `UNIPUSH_SECRET`） |

- `.env.dev` 与 `.env.prod` 的**字段集合必须完全一致**（只有取值可以不同），由 `npm run check:env` 在构建期校验。
- 根目录 `.env` 是 DCloud 的文件名约定，**不能改**：HBuilderX 本地运行 `univerify-exchange` / `unipush-send` 时会把它当云函数环境变量注入。
- 生产构建有硬校验（`vite.config.ts` 的 `checkApiBaseUrl()`）：缺失、指向 localhost、指向测试服、不是 https，一律 **fail build**。
- 判定「是否生产构建」用 `isProduction(mode)`，不要写 `mode === "production"`（HBuilderX GUI 与 CLI 的 mode 别名不同）。

---

## 3. 本地构建

```bash
npm ci
npm run check:env     # 环境文件守卫
npm run lint          # eslint
npm run type-check    # vue-tsc --noEmit
npm run build:app     # 产物：dist/build/app
```

产物目录 `dist/build/app` 就是 HBuilderX「发行 → 原生 App-云打包」时可导入的资源包。

> 依赖版本是锁死的：`vue` 与 `@vue/runtime-core` 锁 `3.4.21`，`pinia` 锁 `2.2.4`。
> 改成 `^3.4.21` 会解析到 3.5.x，Vite dedupe 后
> `@vue/runtime-core@3.5.x` 拿到 `@vue/shared@3.4.21`，编译直接失败
> （`"normalizeCssVarValue" is not exported by "@vue/shared"`）。
> 改版本后必须清 `node_modules/.vite` 并重启 HBuilderX 的运行进程。

---

## 4. GitHub Actions

| 工作流 | 文件 | 触发 | 做什么 |
|--------|------|------|--------|
| CI | `.github/workflows/ci.yml` | push（忽略 `v*` tag）、PR、手动 | 环境校验 → lint → 类型检查 → 构建资源包，**不发布** |
| Release | `.github/workflows/release.yml` | `v*.*.*` tag；或手动试运行 | tag：云打包、OSS、后台与 GitHub Release；手动：只产出并校验 APK |

`release.yml` 复用 CI 作为门禁。APK 的包名、versionName、versionCode、签名 SHA-256
和 OSS 公网地址任一校验失败，都不会修改后台当前版本。手动试运行不需要 OSS 或后台
Secrets，不上传 OSS、不同步后台、不创建 GitHub Release，只在 Actions 中保存 APK artifact。

### 4.1 配置 Secrets

在 GitHub 仓库进入 **Settings → Environments**，新建 `production`，再进入
**Environment secrets → Add secret**。Release job 使用该环境，普通 CI 不读取这些值。

| Secret | 来源与要求 |
|--------|------------|
| `DCLOUD_USERNAME` | DCloud 账号邮箱或手机号 |
| `DCLOUD_PASSWORD` | DCloud 账号密码；账号需有该 AppID 的云打包权限 |
| `ANDROID_KEYSTORE_BASE64` | 正式 `idoltrail.jks` 的 Base64 全文，不是文件路径 |
| `ANDROID_KEYSTORE_STORE_PASSWORD` | Keystore 证书库密码 |
| `ANDROID_KEYSTORE_ALIAS` | 证书别名 |
| `ANDROID_KEYSTORE_KEY_PASSWORD` | 别名对应的证书密码 |
| `OSS_ENDPOINT` | 如 `https://oss-cn-beijing.aliyuncs.com` |
| `OSS_BUCKET` | 安装包 Bucket 名称 |
| `OSS_PUBLIC_URL` | Bucket 的永久公网地址或 CDN 域名，如 `https://cdn.example.com` |
| `OSS_ACCESS_KEY_ID` | 仅允许向该 Bucket 的 `app-releases/*` 上传的 RAM AccessKey ID |
| `OSS_ACCESS_KEY_SECRET` | 上述 RAM AccessKey Secret |
| `APP_VERSION_ACCESS_KEY` | 后台签发的机器 key，只勾选 `app:version` 权限 |

Keystore Base64 可用以下方式生成：

```bash
# Linux / Git Bash
base64 -w 0 idoltrail.jks
```

```powershell
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('idoltrail.jks'))
```

OSS Bucket 或 CDN 必须允许匿名读取发布后的 APK；流水线会用 HTTP HEAD 实际验证。
后台 AccessKey 在「AccessKey 管理」中签发，不要将管理员 JWT 当成机器 key。

---

## 5. 发版流程

```bash
# 1. 确认工作区干净、代码已进入目标分支
git status
git log --oneline -5

# 2. 打语义版本 tag 并推送；不要在本地先手工改版本号
git tag v1.0.0
git push origin v1.0.0

# 3. 在 Actions 的 Release 中观察云打包、APK 校验、OSS 上传与后台同步
```

tag 会驱动 `manifest.json`、`APP_VERSION_NAME` 和后台版本号，versionCode 自动递增。
DCloud 临时地址不会直接写入后台；发布成功后后台与 GitHub Release 使用同一个 APK。

### 5.1 手动云打包备用

自动流水线不可用时，仍可用 HBuilderX「发行 → 原生 App-云打包」手动出包，
再上传永久存储并在后台录入版本。手动流程不能替代包名、版本与签名校验。

### 5.2 打 tag 前必须确认的开关

| 开关 | 位置 | 当前值 | 说明 |
|------|------|--------|------|
| `VITE_PUSH_ENABLED` | `.env.prod` | `true` | 关掉则收不到任何系统推送，通知只在应用内可见 |
| `VITE_ADMIN_ENABLED` | `.env.prod` | `false` | 生产强制关（`checkAdminGate()` 会再按死一次） |
| `VITE_DONATE_ENABLED` | `.env.prod` | `false` | 捐赠入口总闸 |
| `VITE_DONATE_IOS_ENABLED` | `.env.prod` | `false` | iOS 需 StoreKit IAP，默认关 |
| `VITE_DONATE_NATIVE_READY` | `.env.prod` | `false` | Android 微信 App 支付；`wx_app` 配置、`Payment` 模块和真机验收完成前必须关 |
| `VITE_APPLE_LOGIN_ENABLED` | `.env.prod` | `false` | Apple 登录入口，默认关 |
| `app-plus.modules` | `src/manifest.json` | 含 `OAuth`、`Push`，未含 `Payment` | 缺 `OAuth` 则**一键登录没有该能力**；Android 微信 App 支付还需 `Payment` 模块及云打包 |

### 5.3 真机验证的前提

- **推送**：必须用含 uni-push 模块的**自定义基座或云打包**安装，标准 HBuilder 运行基座收不到推送；
  且 DCloud 后台需配置厂商通道（华为/小米/OPPO/vivo），否则 App 被回收后基本收不到。
- **一键登录**：必须用含 OAuth 模块的基座或云打包，且设备处于**移动数据**下（Wi-Fi 取不到本机号码）。
  DCloud 后台需已为 `__UNI__F1F9279` 开通一键登录服务，云函数 `univerify-exchange` 已上传并 URL 化。
- **服务端下发**必须经 uniCloud 云函数，自建 Go 服务无法直连 uni-push。

---

## 6. 后端与接口地址

App 的生产包指向 `https://api.idoltrail.com/api/v1`（v2 隔离栈，`/api/` 反代到 v2 API 容器）。
该域名与 `admin.idoltrail.com`（后台）同在 `47.94.165.221`，但走独立 vhost 与独立库（`idoltrail`），与生产业务库无交集。

后端部署、导入与回滚见 `../idoltrail-server-main/DEPLOY.md` 与
服务器上的 `/home/dev/idoltrail-backend-v2/README-DEPLOY.md`。

---

## 7. 上架前必做

1. `src/manifest.json` 的 `appid` 必须是真实 DCloud AppID `__UNI__F1F9279`（**不要改成占位符**）。
2. `src/pages/admin/` 仍打包在 App 内（`pages.json` 无法按 mode 条件编译），
   已用构建期开关封死入口，但要彻底消除需后端对 `/admin/*` 加来源校验，并把后台迁到独立 Web 控制台。
3. 隐私政策正文已与实际采集数据对齐，上架前仍需人工复核 `privacyDescription` 与实际 SDK 采集行为是否一致。
4. Android 微信 App 支付的客户端与服务端链路已实现：`POST /api/v1/donations` 以 `channel=wx_app` 下单，
   `requestWxAppPay` 调起微信，服务端回调入账，客户端轮询订单。当前 `VITE_DONATE_NATIVE_READY` 保持 `false`，
   因为 `manifest.json` 尚未声明 `Payment` 模块，且微信移动应用 AppID、包名与正式签名登记、商户号绑定、
   支付证书配置及真机验收尚未完成。支付宝 `alipay_app` 的服务端下单仍未开放。
5. 一键登录依赖 3 件外部条件，缺一则入口静默消失：DCloud 后台开通服务、云函数已 URL 化、后端已填 `UNIVERIFY_*`。

---

## 8. 回滚

App 已上架版本无法回滚，只能**发新版本**（热更新仅对未上架的云打包资源有效）。
因此发版前的验证是唯一防线：

- CI 门禁必须绿（环境校验 / lint / 类型检查 / 构建）；
- 用**与线上同一套后端**（v2 隔离栈）做真机冒烟：登录、列表、详情、搜索、投稿、通知；
- 灰度：Android 用内测/分阶段发布，iOS 用 TestFlight。

若发现线上问题且必须紧急止血，优先考虑**后端侧**（关开关、降级、限流），
而不是赶一个未验证的 App 版本上架 —— 上架审核本身就要数小时。
