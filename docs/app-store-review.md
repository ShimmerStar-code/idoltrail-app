# 小米 / 华为应用商店上架：合规要求与代码落点

> 对照两家商店（小米应用商店、华为 AppGallery）的审核要点，列出**代码里已经落实的部分**
> 与**必须人工准备的材料**。审核时最常见的拒审原因都集中在"隐私弹窗"这一条链路上，
> 本文的重点就是保证这条链路不踩线。
>
> 关联文档：推送接入见 [unipush-offline.md](./unipush-offline.md)；
> 协议正文见 `src/constants/agreements.ts`。

---

## 1. 隐私弹窗链路（两家共同的最高频拒审点）

| 审核要求 | 代码落点 | 状态 |
|----------|----------|------|
| 首次启动必须弹窗展示隐私政策，**不能默认勾选同意** | **原生模板弹窗**（`src/androidPrivacy.json` `prompt:"template"`）在 splash 阶段挡住应用，用户点「同意并接受」才进入 App；JS 侧检测到原生已同意即不再弹自绘弹窗 | ✅ |
| 弹窗中隐私政策**可点击完整阅读** | 原生弹窗链接指向包内 `static/privacy.html`（由 `npm run export:agreements` 与协议正文同源生成）；App 内协议页正文为**当前生效版本**（服务端优先、包内兜底，离线可读） | ✅ |
| **同意前不得收集任何个人信息、不得读取设备标识** | 见下方 §1.1 / §1.1.1 | ✅ |
| **同意前不得申请敏感权限** | 定位：首页只走 IP 粗定位，精确位置权限只在用户点「重新定位」时申请；通知：见 §1.1 | ✅ |
| 不同意时不能强制收集，可退出 | 原生弹窗 `disagreeMode.support=false` → 拒绝即退出；自绘弹窗"不同意并退出" → 二次确认 → `plus.runtime.quit()` | ✅ |
| 隐私政策内容完整（信息 / 目的 / 第三方 SDK / 权限 / 权利 / 联系方式） | 《隐私政策》v1.0.0 已补齐 SDK 清单（含 `io.dcloud` 基础模块）、**采集时机**、DCloud 引擎采集条款、共享方、权限清单、存储期限 | ✅ |
| 隐私政策链接打不开 | 原生弹窗走包内静态页（离线可读）；App 内走**当前生效版本**（包内兜底 + 服务端缓存） | ✅ |
| 隐私政策与实际采集行为一致 | 每次改动采集行为都要同步改协议正文；**版本号强制锁定 v1.0.0 不递增**（递增会让存量用户同意失效且签署记录失配），改完跑 `npm run export:agreements` 让三处同源，`npm run check:agreements` 校验 | ✅ |

### 1.1 「同意前不收集个人信息」做了什么

同意之前，App **只做一件事**：下载一张默认头像图片（静态资源，不带任何设备标识）。
以下全部挂在 `userStore.privacyGranted === true` 之后（见 `src/App.vue` 的 `afterPrivacyConsent`）：

| 行为 | 为什么不能在同意前做 |
|------|----------------------|
| `initPush()`（`plus.push.addEventListener`） | 会拉起 uni-push 的**小米 / 华为厂商通道 SDK**，它们在初始化阶段就要读设备标识去注册通道 |
| `checkNotifyPermissionHint()` | 读系统信息（机型 / 系统版本）判断 Android 版本 |
| `userStore.bootstrapSession()` | 带 token 请求后端，携带设备信息与 IP |
| `appStore.checkAndShowDisclaimer()` | 免责声明若与隐私弹窗同时弹会叠成两层 mask，顺序上应在隐私告知之后 |

> 反过来说：**同意之后**才会出现 uni-push 的设备标识采集，因此《隐私政策》里
> 声明的"厂商 SDK 读取设备标识"与实际时机一致，不会出现"声明了但没采"或"采了没声明"。

### 1.1.1 首启的"同意"发生在原生层，不是自绘弹窗（2026-10-26 整改）

**这是国内应用市场检测「未经用户同意即收集个人信息」最常见的根因，也是本项目
当前最重要的一条合规链路。**

uni-app 的 **JS 代码启动得比原生晚**，而第三方 SDK（uni-push / 厂商通道 / WebView 内核）
在**原生插件被加载时**就会读取 OAID、Android ID、安装列表。于是会出现这个顺序：

```
原生插件加载 → SDK 采集设备标识 → JS 启动 → 自绘隐私弹窗才出现
```

检测引擎看到的是"隐私政策弹窗已经弹出，但 SDK 在弹窗之前就采过了"，
于是判定为「未经用户同意即收集个人信息」（引擎 1 / 引擎 3 的报法）。

DCloud 官方的解法（见 `https://uniapp.dcloud.net.cn/tutorial/app-privacy-android.html`）：

> 目前设置 custom 模式策略，并不能完全避免在弹出隐私提示框之前，读取设备信息
> （如 mac 地址、应用列表等）的情况……**碰到此问题的开发者请先使用 template 模式解决**。

本项目的落地方式：

| 层 | 做法 | 位置 |
|----|------|------|
| 原生层 | `src/androidPrivacy.json` 的 `prompt: "template"`：**原生模板弹窗在 splash 界面挡住应用，用户点「同意并接受」之后才进入 App、才加载原生插件** | `src/androidPrivacy.json`（编译期由 `copy-webpack-plugin` 复制到 `dist/build/app/`） |
| 原生层 | `disagreeMode.support=false` + `loadNativePlugins=false`：用户拒绝即退出，且不加载任何原生插件 | 同上 |
| 原生层 | `backToExit="true"`：弹窗期间点系统回退键也退出，不给绕过留口子 | 同上 |
| JS 层 | 启动时读 `plus.runtime.isAgreePrivacy()`：**原生已同意 → 同步本地同意状态，且不再弹自绘弹窗** | `src/utils/privacy.ts` `isNativePrivacyAgreed()` + `src/App.vue` `onLaunch` |
| JS 层 | 降级路径（原生模板弹窗未生效）：自绘弹窗点「同意」时回写 `plus.runtime.agreePrivacy()`，点「不同意」时回写 `disagreePrivacy()` | `src/utils/privacy.ts` `syncNativePrivacyAgree/Disagree()` |

**为什么原生已同意时不能再弹自绘弹窗**：自绘弹窗出现在 SDK 初始化**之后**，
检测引擎会把它当成"隐私政策弹窗"，然后发现 SDK 在它之前就已经采集了 → 反而坐实违规。

原生模板弹窗里的协议链接指向**包内**静态页（`static/privacy.html`、
`static/user-agreement.html`），由 `npm run export:agreements` 与
`src/constants/agreements.ts` 同源生成——不依赖网络，也不会出现"两份正文"。

### 1.1.2 「弹窗跳两次」已修

`PageLayout` 在**每个页面**都挂了一份 `PrivacyPopup` / `LoginModal` / `DisclaimerPopup` 实例，
而弹窗开关状态在 store 里是全局的 —— 从弹窗点《隐私政策》跳到协议页时，新页面会再挂一个实例，
watch 到状态仍为 true 就**再弹一遍**（两层 mask 叠在一起，点不动）。

修法（`src/stores/user.ts` 的 `globalOverlaySuspended`）：

1. 跳协议页前：`suspendGlobalOverlay()` + `closePrivacyPopup()`；
2. 协议页 `onLoad` 再置一次抑制（双保险，避免生命周期顺序问题）；
3. 三个弹窗组件的 watch 与 `onMounted` 都检查该标记，抑制期间不弹；
4. 协议页 `onUnload` 解除抑制；若此时仍未同意隐私政策，则重新拉起弹窗。

---

## 2. 权限最小化

| 权限 | 策略 | 落点 |
|------|------|------|
| 定位 | **默认不申请**：首页只用 IP 推断城市；精确位置权限仅在用户于「城市选择器」点「重新定位」时申请 | `src/utils/location.ts` `locateCity({ precise: true })`、`src/components/CityPicker/index.vue` `reLocate()` |
| 通知（Android 13+） | 运行时申请，且**在同意隐私政策之后**才可能触发 | `requestNotificationPermission` |
| 相机 / 相册 | 不主动申请，走系统选择器 | `ensureSystemPermission` |
| 手机状态（READ_PHONE_STATE） | **不申请**（`permissionPhoneState.request = "none"`），设备标识用系统 UUID | `src/manifest.json` |
| 厂商 SDK 声明的权限 | 不主动申请，但商店权限列表仍可能出现（如 HMS 的安装包权限）→ 已在《隐私政策》如实披露 | 《隐私政策》「二、权限申请清单」 |

> ⚠️ 「首启 / 首页加载就弹位置授权框」是国内商店的高频拒审点，判罚名目是
> 「强制、频繁、过度索取权限」。因此定位权限的申请点**只有一个**：
> 用户自己点「重新定位」。首页与首屏一律走 IP 粗定位（不碰任何系统权限）。

---

## 3. 检测反馈与整改对照（2026-10-26）

| 检测引擎 | 报法 | 根因 | 整改 |
|---------|------|------|------|
| 引擎 1 | 个推消息推送 SDK 读取 OAID，未经用户同意 | uni-push 的个推 SDK 在 **main.js 顶层**就初始化（`dist/uni-push.es.js` → `initGtPush`），早于任何 JS 弹窗；自绘隐私弹窗在 SDK 之后才出现 | ① 启用原生模板弹窗（`androidPrivacy.json` `prompt:"template"`），同意后才加载原生插件；② JS 层启动时读 `plus.runtime.isAgreePrivacy()`，原生已同意就**不再弹自绘弹窗**；③ 自绘弹窗同意/拒绝分别回写 `agreePrivacy()` / `disagreePrivacy()` |
| 引擎 2 | 首次打开提前申请位置权限 | 首页 `onMounted` 自动 `doLocate()` → `requestLocationPermission()` | 定位改为**用户主动触发**：首页与首屏只走 IP 粗定位（不申请任何系统权限），精确位置权限只在「城市选择器 → 重新定位」申请 |
| 引擎 3 | 个推公共库 sdk,Gtc 获取 Android ID、安装列表，未经同意 | 同引擎 1 | 同引擎 1；另在《隐私政策》6.2 补齐 SDK 清单与**采集时机**明示 |

《隐私政策》本轮（v1.0.0）同步的要点（政策须与实际行为一致）：

- 6.1 第 2 条按 **DCloud 官方必写条款**声明运行底座采集的设备标识（IMEI / Android ID /
  DEVICE_ID / IDFA、SIM IMSI、OAID）用于统计分析与异常日志，并附官方隐私政策链接；
- 一.2 新增「应用运行状态信息」条目，列明 DCloud App 引擎在运行期读取的运行态数据；
- 二 新增「关于运行底座声明的权限」：引擎在安装包声明了网络访问、网络状态、读写外部存储、
  读取手机状态等权限，本应用**不主动申请**后两项，因此引擎读不到 IMEI / IMSI 与公共存储文件；
- 6.2 补齐「采集时机」：所有第三方 SDK 均在**同意本政策之后**才初始化并读取设备标识；
  新增「uni-app（5+ App）基础模块（io.dcloud）」SDK 条目；
- 6.2 SDK 清单补入「卓信ID SDK（com.zx）」（uni-push 个推 SDK 内置），
  OAID 补齐 `com.bun.miitmdid` / `com.zui.opendeviceidlibrary` / `com.netease.nis` /
  `com.samsung.android` / `com.huawei.hms`，6.3 同步列接收方；
- 第 6 / 7 项：位置改为"您主动点击定位并授权后"获取，IP 粗定位为**默认路径**；
- 「二、权限申请清单」：位置权限改为"仅在您主动点击定位入口之后申请"。

> **版本号强制锁定 v1.0.0**（不递增）：政策正文可修订，版本号不动。
> 三处硬约束：服务端 `content.json` 是「当前生效版本」的唯一真源、
> `user_agreements` 唯一键含 version、递增版本会让存量用户同意失效。
> 改完 `src/constants/agreements.ts` **必须**跑 `npm run export:agreements`：
> 它同时写后端 `content.json` 与包内 `src/static/privacy.html` / `user-agreement.html`
> （原生模板弹窗的链接落地页），三处正文同源。
> 再跑 `npm run check:agreements` 验证版本锁与三处同源（CI 已接入）。

### 3.1 若引擎仍点名个推 SDK

说明**原生模板弹窗在检测机型上没有生效**（JS 依然先于弹窗启动）。备选方案：

把 `src/manifest.json` 的 `app-plus.distribute.sdkConfigs.push.unipush.offline` 改为 `true`，
编译器会解析到 `dist/uni-push.plus.es.js`（**不含个推 SDK**，只走厂商通道）。

代价（务必先评估）：

- 离线推送改为**厂商通道**，必须在 DCloud 后台为 `__UNI__F1F9279` 配置小米 / 华为凭据，
  否则离线推送不可用（详见 [unipush-offline.md](./unipush-offline.md)）；
- 客户端 cid 类型会变（jssdk → native sdk），需重新上报。

---

## 4. 需要人工准备的材料（代码解决不了）

| 材料 | 说明 | 负责人 |
|------|------|--------|
| **App 备案号** | 提交时必须填写并核验（工信部 ICP 备案，域名与包名需一致） | 主体备案人 |
| **软件著作权证书** | 两家一般都要（软著名称需与 App 名称一致） | 公司 |
| **企业开发者认证** | 小米 / 华为均要求企业主体认证 | 公司 |
| **类目资质** | 按所选类目提供（如"演出/票务"类需要的资质） | 运营 |
| **测试账号** | 需登录的 App 必须提供可用的测试账号 + 密码 | 运营 |
| **隐私标签 / 数据安全表** | 华为的"数据安全"表单必须与《隐私政策》一致 | 提审人 |
| **隐私政策访问地址** | 商店要求可访问的 HTTPS 链接（后台 `GET /public/agreements` 已提供，需挂到官网） | 运维 |
| **包名与签名** | 小米通道需用**云打包正式证书**上传；华为需在 AGC 登记包名 + 证书 SHA1 | 打包人 |

> 提审前确认包名/签名与各厂商平台登记的完全一致，否则推送通道与部分 SDK 会静默失败。

---

## 5. 提审前自检清单

- [ ] 全新安装（清空数据）启动 → **只弹一次**隐私弹窗（原生模板弹窗在 splash 阶段，
      进 App 后**不应再出现**自绘弹窗；若出现说明 `isAgreePrivacy` 同步没生效）
- [ ] 原生弹窗里点《隐私政策》→ 打开的是**全文**（可滚动到底），正文与 App 内协议页一致
- [ ] 原生弹窗里点"暂不同意" → 二次确认后 App 退出进程
- [ ] 弹窗里不点同意，直接划走 / 退后台 → 断点抓包，**不应有任何携带设备标识的请求**
- [ ] 协议页底部有"同意隐私政策 / 同意用户协议"按钮；同意后页尾显示**同意时间 + 版本**
- [ ] 同意后 → **首页不弹位置授权框**；点「城市选择器 → 重新定位」才弹
- [ ] 登录弹窗里的《用户协议》链接 → 同样不叠加第二个登录框
- [ ] 《隐私政策》版本号与商店要求一致（当前锁定 v1.0.0），且与隐私标签填写内容逐条对应
- [ ] `dist/build/app/androidPrivacy.json` 存在且 `prompt` 为 `template`；
      `dist/build/app/static/privacy.html` 存在（云打包会上传这两个文件）

---

## 6. 协议与代码的同步纪律

- 协议正文与版本号**同处** `src/constants/agreements.ts`（避免只改文案忘改版本）。
- **版本号强制锁定 v1.0.0，不递增**。三处硬约束：
  1. 服务端 `content.json` 是「当前生效版本」的唯一真源，登录时用它查签署记录，
     App 上报版本必须与服务端**完全一致**，否则表现为「每次登录都要求重新勾选协议」；
  2. `user_agreements` 唯一键是 `(user_id, agreement_type, version)`，版本漂移 = 历史记录全部失配；
  3. 递增版本会让存量用户的隐私同意失效，下次启动集体重新弹窗。

  要改版本 = 显式声明「协议版本变更」，必须同时改
  `src/constants/agreements.ts` 的 `PRIVACY_VERSION` / `AGREEMENT_VERSION`、
  `src/androidPrivacy.json` 的 `version`、后端 `internal/agreements/content_test.go`
  的 `lockedVersion`，并重跑导出。
- 改完必须执行 `npm run export:agreements`，它会同时写：
  - `../idoltrail-server-main/internal/agreements/content.json`（后端 `go:embed`，**不重新构建镜像不生效**）
  - `src/static/privacy.html`、`src/static/user-agreement.html`（原生模板弹窗的链接落地页）
- 执行 `npm run check:agreements` 验证：版本锁 + 包内静态 HTML 与正文同源 +
  （有后端仓时）服务端 `content.json` 与 App 端逐字一致。CI 已接入该校验。
- 后端 `AcceptAgreement` 只校验版本**格式**、不要求与当前版本相等，
  这样 App 包与后端镜像的发布时序错位不会把用户挡在登录之外。
