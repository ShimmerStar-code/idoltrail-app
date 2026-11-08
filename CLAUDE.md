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

### 启动只弹一个窗：隐私同意

启动阶段**只允许有一个必须打断用户的弹窗：隐私同意**（原生模板弹窗 / 降级自绘弹窗）。
协议补签、登录框都属于「用户本来就要操作才能用」的流程，可以弹；
其余凡是「只是告知、不需要授权」的内容，**一律不得在启动时弹窗**。

数据免责声明原来在启动时弹（`DisclaimerPopup`），已撤掉：

- 组件 `src/components/DisclaimerPopup/`、store `src/stores/app.ts`、
  storage 的 `hasDisclaimerShown/setDisclaimerShown` 全部删除，别再复活。
- 文案与举报邮箱统一在 `src/constants/disclaimer.ts`（`DISCLAIMER_FULL` /
  `DISCLAIMER_SHORT` / `REPORT_EMAIL`）。
- 现在下沉到三处**常驻**位置：
  1. 「关于我们」页 → 数据说明与侵权举报区块（完整正文 + 可复制举报邮箱）
  2. 活动详情页底部 → 一行免责小字 + 「侵权举报」（点击复制邮箱）
  3. 上传情报页提交栏 → 贡献者须知（发布即代表已核实）

理由：启动弹窗每多一层就掉一截留存，而免责声明不需要用户授权任何能力。

### 启动图（splashscreen）

Android 启动图是**原生层**资源（Activity 的 `windowBackground`），不是前端页面。

- `windowBackground` 的 Bitmap 被系统按 **fill** 铺满窗口 → 普通 PNG 图比例 ≠ 屏幕比例就**必然拉伸变形**。
  实测（Redmi K40 / 1080×2460 / Android 14 / MIUI）：旧整屏图 1080×1882 被纵向拉伸
  **1.307 倍**（2460/1882）铺满全屏，logo 与文字明显拉长 —— 这就是「启动图畸变」的根因。
- **解法：`.9.png`（九宫格）**，官方明确支持
  （<https://uniapp.dcloud.net.cn/tutorial/app-splashscreen.html>「Android平台同时支持使用.9.png图片…
  可以指定特定的区域进行拉伸而不失真」）。
  - 固定区 = 品牌锁定图 `splash_brand.png`（原件，200dp，**不缩放不重采样**）→ 1:1 不变形；
  - 可拉伸区 = 品牌区之外的渐变底 → 多余空间只由可拉伸区按各自源尺寸比例瓜分；
  - 上下留白相等 ⇒ 品牌在**任何**机型上都居中（K40 实测居中偏差 x 0.0px / y ≤0.5px）。
  - 数值：品牌形变 **0%**、品牌像素 Δ0、渐变接缝 Δ1/255（普通 PNG 方案是 2.5%~5% 形变）。
- **底色按 AOSP `GradientDrawable` 语义从 res 渲染**（`res/drawable/splash_background.xml`）：
  - `angle=315` → `Orientation.TL_BR`（渐变线 = 矩形对角线 `(0,0)→(w,h)`，
    `t = (x·w + y·h)/(w²+h²)`）；
  - `centerColor` 停靠点 = `mCenterX != 0.5 ? mCenterX : mCenterY` = **0.30**。
  - 底色只取交付视觉里真实出现的 `#FFE39A → #FCA8B3`（粉位仍在 30%）。
    设计师交付图（`preview/android_layerlist_1080x1920.png` 与 `fullscreen/` 天空区）
    的底色**深紫占比 0.0%**，`#9C5B87` 只出现在底部插画里；
    若按 XML 字面再叠 `endColor=#9C5B87`，右下角会铺满深紫（实测「亮度 < 140」的像素
    占 **17.3%**，平均亮度从 200.6 掉到 175.5），与交付视觉不符 —— 别再加蒙层/调色去救。
- **文件组织（云打包约定）**：`app-icons/splash-9patch/{hdpi,xhdpi,xxhdpi}/splash.9.png`
  - 文件名必须以 **`.9.png` 结尾**：aapt2 只对 `*.9.png` 编译 nine-patch chunk（资源名仍是
    `drawable/splash`）；改名成 `splash.png` 会丢 chunk → 露出 1px 黑边并被拉伸。
  - 与官方离线打包约定一致（`res/drawable-xxxhdpi/splash.9.png`）。
  - ⚠️ **云打包取的不是 `app-icons/`，而是 HBuilderX 的工作缓存**
    `dist/cache/wgt/<appid>/.manifest/splash-android-<桶>.9.png`。
    该缓存**只在 manifest 里的路径变化时才会重新拷贝**——同路径文件内容改了它不刷新，
    于是「明明改了启动图，云打包还是用旧文件」（本次就是这样：修好边框后云打包仍报
    `too many padding sections on bottom border`）。
    **改完启动图必须手动同步**：
    ```bash
    for b in hdpi xhdpi xxhdpi; do cp "app-icons/splash-9patch/$b/splash.9.png" \
      "dist/cache/wgt/__UNI__F1F9279/.manifest/splash-android-$b.9.png"; done
    ```
    （appid 以 `src/manifest.json` 的 `appid` 为准；同步后用 md5 核对缓存里的文件。）
    `npm run build:app`（CLI）**不产** `.manifest`，这个目录只有 GUI 打包流程才会生成。
- **九宫格边框语义（aapt2 规则，踩过坑）**：
  - **上边**黑段 = 水平可拉伸的**列**（stretchX），**左边**黑段 = 垂直可拉伸的**行**（stretchY）
    —— 这两边**允许多段**（品牌图居中，左右/上下各一段）；
  - **下边/右边**黑段 = 内容区 **padding**，aapt2 **最多允许 1 段**；
    本图内容铺满整张、没有 padding，所以这两边**一个黑像素都不能画**。
  - ⚠️ 早期版本把黑段同时画在「顶+底 / 左+右」四边 → **云打包直接失败**：
    `error: too many padding sections on bottom border.` + `error: file failed to compile.`
    （底边两段黑 = 两段 padding，aapt2 拒绝）
- **字节级锁定是硬红线**，`npm run check:splash` 校验：manifest 三档路径 + PNG 实际尺寸
  （内容 + 2px 边框）+ md5 + **九宫格边框标记**（上边黑段 = 水平可拉伸列、
  左边黑段 = 垂直可拉伸行，且恰好等于「品牌区之外」；下边/右边必须无黑；角点透明）。任何改动非零退出。
  - md5：`2f06bd1d80c280b193bea368df9db372`（hdpi 482×802）/
    `6142ee671c292047e148f4ff535ffe7b`（xhdpi 722×1442）/
    `828d45347d6f48190345f0d3a0dc2723`（xxhdpi 1082×2402）
  - ⚠️ **整圈描黑 = 整张图都变可拉伸区** → 品牌图跟着变形。边框黑段只能画在「品牌区之外」。
  - **产物由脚本生成**：`python scripts/build-splash-9patch.py --design "<交付素材根目录>"`
    （需 Pillow；素材目录含 `android/app/src/main/res/drawable-{hdpi,xhdpi,xxhdpi}/splash_brand.png`）。
    脚本内置 aapt2 等价自检（底/右黑段数、顶/左黑段、角点透明），并打印新 md5 → 填回
    `scripts/check-splash.mjs` 的 `EXPECTED`。**改启动图必须走脚本，不要手改 PNG**。
- `androidStyle` 必须 `"default"`（取 `"common"` 时按密度配的组图**整个不生效**）；
  iOS 必须保持 `"common"`（自定义启动图自 2020-06-30 起无法提交 App Store）。
- `androidNavigationBarColor: "#FCA8B3"` 取启动图底部主色，防启动时导航栏闪白。
- ⚠️ **启动图只在云打包后生效**（官方原文：「启动界面设置需提交云端打包后才能生效」）。
  本地运行与 `npm run build:app` 都看不到效果，验证必须走**云打包 APK + 真机冷启动**。
  真机验收点：①无 1px 黑边 ②品牌不变形 ③品牌居中 ④底色与设计稿一致。
  若出现黑边 → 云打包把文件改名成了 `splash.png`，改回 `.9.png` 命名即可。
- 九宫格版对应设计交付包的**方案 B**（渐变底 + 居中锁定图，**不含底部插画**）；
  含插画的整屏图属方案 A，只能靠 JS 层自绘启动页（cover 裁切）落地。

### 页面结构

- `src/pages.json` **不声明原生 tabBar**，底部导航由页面内 `<TabBar>` 自绘，切换走 `switchTabPage()`。
- **新页面必须用 `<PageLayout>` 包裹**。`LoginModal` / `PrivacyPopup` / `NotificationPromptModal` 由 `PageLayout` 挂载，不在 `App.vue` 的 template 里。
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
VITE_API_BASE_URL=https://api.idoltrail.com/api/v1   # .env.dev：当前**也指向生产 v2 隔离栈**（不是 69！）；必填，
                                                #   生产构建缺失或指向 localhost 会 fail build
                                                # .env.prod：https://api.idoltrail.com/api/v1（v2 隔离栈，同上）
```

> ⚠️ **`.env.dev` 与 `.env.prod` 现在指向同一个后端**（`https://api.idoltrail.com/api/v1`，生产 v2 隔离栈）。
> 联调时想打 69，必须**手动把 `.env.dev` 改成 `http://103.24.218.69:8081/api/v1`**。
> 排查「设备上的 App 到底连的哪个后端」别靠记忆，**看设备上的编译产物**：
>
> ```bash
> adb shell "grep -o -E 'https?://[a-zA-Z0-9.:/_-]*api[a-zA-Z0-9.:/_-]*' \
>   /storage/emulated/0/Android/data/io.dcloud.HBuilder/apps/HBuilder/www/app-service.js | sort -u"
> ```
>
> 详见 [`docs/device-push-test.md`](docs/device-push-test.md) 的 §2。

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
- 真机验证**离线通知**必须用**含 uni-push 模块的自定义基座或云打包**安装，标准 HBuilder 运行基座没有厂商通道。
  但基座**能**取到 2.0 的 cid、能上报后端（`uni.getPushClientId` / `uni.onPushMessage` 都在），
  所以「库里没有该设备」不能直接归因为「基座不支持」。
- `offline:true` 还需在 DCloud 后台配置厂商通道（华为/小米/OPPO/vivo），未配置时 App 被回收后基本收不到。
- **云函数返回 `errCode:0` ≠ 设备已收到**：它只代表任务入队。判断送达要看 logcat 里有没有
  uni-push **2.0** 的连接建立日志、以及系统通知栏里有没有对应通知。
- `usePush.ts` 现在**不静默失效**：`initPush()` / `getPushClientId()` / `syncPushToken()`
  都会打出失败原因（同一原因只打一次），启动时还会打一行 `[App] push capability`。
  排查推送先看这几行日志，不要靠猜。
- 完整的真机联调方法、证据链与当前阻塞点见
  **[`docs/device-push-test.md`](docs/device-push-test.md)** 与
  **[`docs/unipush-offline.md`](docs/unipush-offline.md)**。
- `stores/user.ts` ↔ `composables/usePush.ts` 的循环依赖已断开：后者改为
  `await import('@/stores/user')` 惰性引入。新增代码保持这个结构，不要在顶部静态 import。

## 消息推送逻辑（站内消息 + 系统推送）

- **站内消息与系统推送共用一张 `notifications` 表，但口径完全不同**：
  站内消息（消息中心）不限量、只限本人可见；系统推送（uni-push 通知栏）**每用户每天 2 条**
  （`internal/service/push_quota.go`，未部署）。
- 城市订阅**只推** `new_event` + `event_cancel`；时间/场地/信息变更只推给**活动订阅者**。
  未发布（`DRAFT`）活动不发通知，`event_cancel` 豁免。
- App 端「清空全部消息」依赖后端新接口 `DELETE /notifications`，
  **后端没部署前该按钮会失败并回滚**（不会丢数据）。发布顺序见
  **[`docs/message-push.md`](docs/message-push.md)**。

## 埋点（自研轻量 SDK，不引第三方分析 SDK）

链路：`src/utils/analytics.ts` → `src/api/analytics.ts` → `POST /api/v1/analytics/events`
→ 后端 `analytics_events` 表 → admin-web「数据埋点」看板（`/analytics`）。

### 为什么自研

- **隐私合规**：国内应用商店要求「同意隐私政策前不得采集任何数据」。
  第三方 SDK 常在初始化时就上报设备信息，我们没法卡住它的开关；
  自研能对「同意之前一个字节都不上报」给出确定性保证。
- **离线补报**：弱网 / 进程被杀时事件留在本地队列，下次启动再送。

### 硬约束（改代码前先读）

| 约束 | 原因 |
|------|------|
| **同意前不落盘、不上报** | 同意前只允许 `app_launch` / `privacy_consent` 暂存在**内存**，其余事件直接丢弃 |
| **事件名白名单双写** | App 端 `src/constants/analytics.ts` 与后端 `internal/model/analytics_event.go` 的 `AnalyticsEventTypes` 必须一一对应；后端是权威，不在白名单的事件被静默丢弃 |
| **props 只放业务 id 与枚举** | 禁止放手机号、昵称、坐标、完整 IP、画像标签；搜索词只记长度与命中数，不记原文 |
| **上报走统一请求层** | 必须带 `silent: true` + `skipAuthRedirect: true`：埋点失败不弹 toast，token 失效也**不能**弹强制登录框（未登录是常态） |
| **禁止 `await import()`** | App 平台打包要求单文件（`output.format = iife`），动态 import 会触发代码分割，构建直接失败：`UMD and IIFE output formats are not supported for code-splitting builds` |
| **耗时上报用注入式** | `utils/request.ts` ↔ `utils/analytics.ts` 用 `setLatencyReporter()` 注入连接，静态 import 会成环 |
| **上报路径排除自身** | `request.ts` 里 `/analytics/events` 与 `/auth/refresh` 不计耗时，否则自我放大 |

### 事件清单（当前 21 个）

启动与合规：`app_launch`、`privacy_consent`、`session_end`；
首页：`home_view`、`home_refresh`、`region_switch`、`sort_change`、`category_select`；
内容消费：`list_view`、`event_card_click`、`event_detail_view`、`share_click`、`agenda_add`；
转化：`subscribe_click`、`search_submit`、`search_result_click`、`login_result`；
其它：`city_locate`、`city_select`、`notification_click`、`api_latency`。

### 活跃口径

用**去重 session_id**，不用去重 user_id：未登录用户没有账号，
按用户算会把首启未登录的流量整个漏掉（那正是最需要观测的一段）。

### 发布顺序

1. **先部署后端**（`migrations/0073_create_analytics_events` 由 `pkg/migrator` 启动时自动执行，
   `analytics_events` 表 + `/api/v1/analytics/events` + `/admin/analytics/*` 一并上线）；
2. 再部署 admin-web（看板依赖后端接口，后端没上看板会 404）；
3. 最后发 App 包（App 端上报失败会静默重试，不影响主流程，早发晚发都不会丢数据）。

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

### Go 后端改动的验证走 WSL

本机（Windows）**没有 Go、没有 Docker**。改到 `../idoltrail-server-main`（Go 后端）后，
编译 / vet / test / gofmt 验证一律走 WSL（Ubuntu-24.04，自带 gcc，`-race` 可用）：

```bash
wsl.exe -e bash -lc "cd '/mnt/c/Users/trunk/Desktop/shimmer-star/idoltrail/idoltrail-server-main' \
  && export GOPROXY=https://goproxy.cn,direct GOTOOLCHAIN=auto \
  && gofmt -l ./cmd ./config ./internal ./pkg \
  && go vet ./... \
  && CGO_ENABLED=1 go test -race ./... \
  && go build ./..."
```

`GOTOOLCHAIN=auto` 会按 `go.mod`（go 1.26.1）自动下载 toolchain，WSL 自带的 1.22.2 不用管。
完整说明与坑见服务端仓 `CLAUDE.md` 的「本地工具链：Go 编译验证走 WSL」一节。

### 真机测试走 Mobilerun CLI

本机装了 **Mobilerun CLI v0.7.4**（`C:\Users\trunk\.local\bin\mobilerun.exe`，Python/uv），
可以驱动**本机 USB 连着的 Android 真机**（serial `HMEUPN8XLJT8XWXS`，Android 14 / 1080×2460）。

- 改完代码 → 推设备 → 上手点一遍 → 和服务端对账的完整流程、命令速查、
  24 个功能点的测试步骤与服务端核对点，全部在
  **[`docs/mobilerun-device-test.md`](docs/mobilerun-device-test.md)**。
- 三个必记的坑：**控制台必须先设 `PYTHONUTF8=1`（否则 GBK 崩）**、
  **测试期间必须 `adb shell svc power stayon true`（息屏后所有点击静默失效）**、
  **测之前先 grep 设备上的 app-service.js 确认推的是最新代码**。

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