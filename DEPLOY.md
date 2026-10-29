# App 端 —— 构建与发布指南

> 仓库：`https://github.com/ShimmerStar-code/idoltrail-app.git`
> 技术栈与项目约定见 [CLAUDE.md](./CLAUDE.md)，本文只讲**怎么构建、怎么发版**。

---

## 1. 分发形态

App **不部署到服务器**，也不由 CI 直接产出安装包。链路是：

```
git push            → CI：环境校验 / lint / 类型检查 / 构建资源包（不发布）
git tag v*.*.*      → Release：复用 CI 门禁 → 产出可交付的 App 资源包 artifact
人工下载 artifact   → HBuilderX 导入 → DCloud 云打包 → APK/AAB / IPA
应用商店审核        → 上架
```

为什么 APK/IPA 不在 CI 里出：DCloud 云打包需要 DCloud 账号凭据、签名证书、
以及按模块计费的打包服务，这些不适合放进 GitHub Actions。
CI 的职责是**把「代码没问题」这件事前置到打 tag 之前**，把「能不能装到用户手机上」留给云打包。

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
| Release | `.github/workflows/release.yml` | 打 `v*.*.*` tag、手动 | 复用 CI 作为门禁 → 构建 → 打成 zip artifact |

Release 产出的 artifact 名：`idoltrail-app-<tag>.zip`（内容是 `app/` 资源目录）+ `release-info.txt`（版本、commit、构建时间、AppID）。

`release.yml` 里 `uses: ./.github/workflows/ci.yml` 是**门禁复用**：校验逻辑只有一份，
打 tag 必须先跑通它，不存在「绕过测试直接产出交付包」的路径。

本仓库**不需要任何 GitHub Secrets**：构建不连服务器、不读私有配置，
`uniCloud-*/cloudfunctions` 的密钥由 DCloud 云端持有。

---

## 5. 发版流程

```bash
# 1. 确认工作区干净、版本号与变更一致
git status
git log --oneline -5

# 2. 提交并打 tag
git commit -am "release: v1.0.0"
git tag v1.0.0
git push origin main --tags

# 3. 看流水线：CI（push）+ Release（tag）
#    Release 产出 artifact → 在 Actions 页面下载 idoltrail-app-v1.0.0.zip
```

### 5.1 云打包

1. HBuilderX 打开本项目 → 「发行 → 原生 App-云打包」；
2. 选择 CI 产出的资源包（或本地 `dist/build/app`）；
3. Android / iOS 分别配置证书、图标、启动图；
4. 提交打包，下载 APK/AAB / IPA。

### 5.2 打 tag 前必须确认的开关

| 开关 | 位置 | 当前值 | 说明 |
|------|------|--------|------|
| `VITE_PUSH_ENABLED` | `.env.prod` | `true` | 关掉则收不到任何系统推送，通知只在应用内可见 |
| `VITE_ADMIN_ENABLED` | `.env.prod` | `false` | 生产强制关（`checkAdminGate()` 会再按死一次） |
| `VITE_DONATE_ENABLED` | `.env.prod` | `false` | 捐赠入口总闸 |
| `VITE_DONATE_IOS_ENABLED` | `.env.prod` | `false` | iOS 需 StoreKit IAP，默认关 |
| `VITE_DONATE_NATIVE_READY` | `.env.prod` | `false` | Android 原生支付，后端对账接口未落地前必须关 |
| `VITE_APPLE_LOGIN_ENABLED` | `.env.prod` | `false` | Apple 登录入口，默认关 |
| `app-plus.modules` | `src/manifest.json` | 含 `OAuth`、`Push` | 缺 `OAuth` 则**一键登录没有该能力**（不崩，但入口等于没上线） |

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
4. Android 原生支付的客户端已实现（`src/utils/nativePay.ts`），缺的是后端
   `/donations/wx-app`、`/donations/alipay` 的下单与对账接口，`VITE_DONATE_NATIVE_READY` 保持 `false`。
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
