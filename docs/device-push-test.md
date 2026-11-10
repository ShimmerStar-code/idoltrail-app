# 真机推送联调纪要

> 目的：在**真实 Android 设备**上把 App 的通知链路跑一遍，区分「代码问题」与「平台问题」。
> 本文记录**可复现的操作方法**与**证据**，避免下次重新踩一遍。

| 轮次 | 日期 | 结论 |
|------|------|------|
| 第一轮 | 2026-10-29 | 站内通知链路全通；误判「包里没有 uni-push 2.0」（**结论错误，见第二轮纠正**） |
| 第二轮 | 2026-10-30 | **在线（长连接）通道确认打通**；**离线（厂商通道）仍不通**，卡在厂商 token 未上报 |
| 第三轮 | 2026-10-30 | DCloud 侧「指纹」已更新后复测：**离线仍不通**，`-20102` 依旧；定位到真正原因是**小米厂商配置未在开发者中心填 + 未重新云打包**，且**指纹本来就不是小米通道要的** |
| 第四轮 | 2026-10-30 | **在线 + 离线（小米厂商通道）全部打通**；定稿「通知栏只做聚合提示、点击只打开 App」（`click_type=startapp`）；服务端落地「每用户每天最多 2 条」限流 |

> ⚠️ 第一轮 §5.3 的「APK 里没有 uni-push 2.0」是**错误结论**，第二轮已用反证推翻。
> ⚠️ 第三轮的「离线仍不通」也已被第四轮推翻 —— 详见 `docs/unipush-offline.md` §6.3。
> 读本文前先看 §0.2 与 §0.1。

---

## 0.2 第四轮结论摘要（2026-10-30 下午，最终状态）

| # | 结论 | 证据 |
|---|------|------|
| 1 | **在线通道送达** | 下发后 ~2s 通知栏出现，回执 `successed_online` |
| 2 | **离线（小米厂商通道）送达** | `am kill`（pidof 空）后下发，回执 `successed_offline`，**约 11 分钟后**通知栏出现且 App 进程被厂商通道唤起 |
| 3 | **「不通」曾是误判** | 厂商通道有**分钟级聚合延迟**（MIUI），45s 观察窗必然判失败；必须等 10 分钟以上 |
| 4 | **通知栏点击定稿 `startapp`** | 厂商通道原生支持，不依赖 intent 透传；点通知**只打开 App**，跳转由 App 内部通知中心承接 |
| 5 | **扩展库做不了这个组合** | `uni-cloud-push` 的 `notification` 与 `payload` 互斥（见 `docs/unipush-offline.md` §6.1），必须云函数直连个推 |
| 6 | **每日限流（默认已关闭）** | 每用户每天最多 2 条系统推送的限流**默认 0 = 不限**（2026-11-10 起）。限流按用户计数，会把用户最关心的偶像改期一并丢掉，确需限流时用 `UNIPUSH_DAILY_LIMIT` 显式开启；站内通知始终全量落库 |

> 第四轮的完整数据、下发链路设计与踩坑记录在
> [`docs/unipush-offline.md`](./unipush-offline.md) §6。

---

## 0.1 第三轮结论摘要（2026-10-30 11:22～11:35）

> ⚠️ 本节结论已被第四轮更新（小米厂商配置填好后离线即通）。

前提：DCloud 侧「uniapp 的在线指纹配置」已更新为与本地自有证书一致。

| # | 观察 | 证据 |
|---|------|------|
| 1 | **`-20102` 依旧** | 冷启动 11:23:39 `GySDK-Debug checkRegister failed, code=30004, operator='CM', errorCode=-20102, errorDesc="gysdk appid或者签名无效?"` |
| 2 | 小米本地注册**依然成功** | `Assist_XM: Register mipush, pkg=com.idoltrail.app` → `resultCode={0}` → token `XM_MJJxEPWT0rPNx9WnjLTZSIn9Odm3oc+2ghmL3UCcRP0eAWKORjQQE2QR5nIP2gcZ` |
| 3 | 离线仍然零流量 | 11:27:44 下发 → 11:28:35 观察：进程未被拉起、无通知栏记录、logcat 无 `com.xiaomi.mipush.RECEIVE_MESSAGE` |
| 4 | **包内小米厂商配置为空** | `assets/supplierconfig.json` → `{"supplier":{"vivo":{"appid":"100215079"},"xiaomi":{},"huawei":{},"oppo":{}}}` |
| 5 | **指纹本来就不是小米通道要的** | DCloud 官方《安卓、鸿蒙厂商推送配置》：小米填 **AppID/AppKey/AppSecret**；指纹只有**华为/荣耀**要（SHA256） |
| 6 | 厂商配置是**打包期注入** | HBuilderX 上传 `app-plus.distribute.sdkConfigs.push.unipush` 整段给云端（`plugins/uniapp-extension/out/index.js`），云端与开发者中心配置合并后注入 `supplierconfig.json` |
| 7 | 设备侧独立阻塞 | `RUN_ANY_IN_BACKGROUND: ignore`（MIUI 把「任意后台运行」设为忽略）→ 厂商通道即使下发也拉不起进程 |

**结论**：第三轮未打通，但把「指纹」这个方向彻底排除了（小米不需要指纹）。
真正缺的是 **DCloud 开发者中心 → uni-push 2.0 → 厂商推送设置 → 小米** 里的
**AppID / AppKey / AppSecret**，且改完**必须重新云打包**（现有 0.1.2 包里 `xiaomi` 是空的）。

### 0.1.1 本轮踩到的测试方法坑

| 坑 | 现象 | 正确做法 |
|----|------|---------|
| `am kill` 杀不掉前台 App | 下发后 pid 不变，测出来还是「在线」 | `am force-stop` 才真杀；但 `force-stop` 会置 `stopped=true`，**厂商通道将无法拉起进程** |
| `stopped=true` 阻止厂商拉起 | 解包后进程起不来 | 用户手动点开 App → 再切后台（**不要 force-stop**），保持 `stopped=false` |
| `PandoraEntryActivity` 未导出 | `am start -n .../io.dcloud.PandoraEntryActivity` 报 `SecurityException: not exported` | 用 `monkey -p <pkg> -c android.intent.category.LAUNCHER 1` |
| `monkey` 后 pid 未变 | 以为没启动 | 确认 `ps -A` 里 pid 变了才叫启动成功 |

---

## 0. 第二轮结论摘要（2026-10-30，务必先读）

被测包从 `0.1.1` 换成 `0.1.2`（云打包，2026-10-30 09:55 更新）后重测，得到三条与第一轮**相反**的结论：

| # | 结论 | 决定性证据 |
|---|------|-----------|
| 1 | **包里确实有 uni-push 2.0**（第一轮结论错误） | `dcloud_properties.xml` 里 `Push` feature = `io.dcloud.feature.aps.APSFeatureImpl`；classes2.dex 含 `io/dcloud/feature/aps/{PushManager, PushChannelManager, AbsPushService, APSFeatureImpl}` 与 `io/dcloud/feature/unipush/{GTPushService, CustomGTService, GTNormalIntentService}` |
| 2 | **在线（长连接）通道是通的** | A/B 对照实验：不下发 40s 内 `/notifications` 请求为 **0**；下发后 2s 内出现 **2 次** `GET /api/v1/notifications/unread`（前端 `handleForeground → refreshAfterPush()` 的唯一副作用） |
| 3 | **离线（厂商通道）不通**，且是厂商 token 未上报 | `GySDK checkRegister failed errorCode=-20102「应用无效，应用不存在」`；小米 MiPush 本地注册**成功**（`resultCode=0`，拿到 token `XM_MJJx...`），但 `Assist_MessageManger` 之后**没有**上报成功的日志 |

**当时的唯一阻塞点**（❌ 已被第四轮解决）：厂商 token（小米）没上报到 DCloud/个推 → 服务端无法把消息路由到小米通道 → App 被杀后设备端零流量。

详见 §5.6～§5.9，以及 `docs/unipush-offline.md` §6（第四轮定稿）。

---

## 1. 设备与被测包

| 项 | 值 |
|----|-----|
| 设备 | 小米 `22041216UC`（Redmi），Android 14 / SDK 34，序列号 `HMEUPN8XLJT8XWXS` |
| adb | `C:\Users\trunk\Downloads\HBuilder\HBuilderX\plugins\launcher-tools\tools\adbs\adb.exe`（1.0.41 / 35.0.2-12147458） |
| 被测包 A | `io.dcloud.HBuilder`（**标准运行基座** 15.33）→ 跑**当前工作区代码** |
| 被测包 B（第一轮） | `com.idoltrail.app`（**云打包**正式包，versionName 0.1.1 / versionCode 10，2026-10-28） |
| 被测包 B（第二轮） | `com.idoltrail.app`（**云打包**正式包，versionName **0.1.2** / versionCode 10，2026-10-30 09:55 更新） |
| 云打包包签名指纹 | SHA-1 `B1:D4:18:CB:BC:AD:42:96:D1:F6:79:CC:1B:2C:82:AD:D2:A2:A5:52`<br>MD5 `7B:FC:D8:E5:71:D4:E4:34:06:34:6A:62:13:A8:56:63`（连续小写 `7bfcd8e571d4e43406346a6213a85663`）<br>SHA-256 `21:3D:55:6F:54:FF:7F:D3:05:0B:95:1D:AF:97:8D:22:8A:AE:65:27:55:98:92:AF:B7:5A:D9:BE:D7:A0:76:99`<br>Subject `CN=wyh, OU=rd, O=六等星夜（北京）科技有限责任公司, L=beijing, ST=beijing, C=CN`<br>序列号 `55d08c20`，有效期 2024-09-19 ~ 2052-02-05<br>（各 MD5 口径对照表见 `docs/unipush-offline.md` §3.2） |
| APK 副本 | `C:\Users\trunk\AppData\Local\Temp\uni-agent\idoltrail-012.apk`（22,923,115 字节） |

> 签名指纹取法（apksigner 在 HBuilderX 里就有，不用另装 SDK）：
>
> ```bash
> java -jar "C:\Users\trunk\Downloads\HBuilder\HBuilderX\plugins\app-safe-pack\apksigner.jar" \
>   verify --print-certs idoltrail-012.apk
> ```
>
> ⚠️ **指纹要填到哪里，各家不一样**（2026-10-30 第三轮实测澄清）：
>
> | 厂商 | 厂商通道配置需要什么 | 指纹要不要填 |
> |------|--------------------|------------|
> | 小米 | **AppID / AppKey / AppSecret**（开放平台申请） | **不要** |
> | 华为 / 荣耀 | AppID + **SHA-256 指纹** | **要** |
>
> ⚠️ 第一轮把 `-20102` 归因于「指纹填错」是**错的**（见 §0.1 第 5 条）：
> 小米通道压根不看指纹，缺的是小米 AppID/AppKey/AppSecret。
> `-20102` 的文案「gysdk appid 或者签名无效」会误导人往签名方向查。
>
> ⚠️ **Windows 控制台会把中文主体名输出成乱码**（keytool/apksigner 都这样，
> 是控制台代码页问题，不是证书问题）。要拿到正确的中文 Subject，用 Java 直接读：
>
> ```java
> // 读 META-INF/*.RSA 里的证书并打印 Subject + 三种指纹
> CertificateFactory cf = CertificateFactory.getInstance("X.509");
> Collection<? extends Certificate> certs = cf.generateCertificates(
>     new ByteArrayInputStream(Files.readAllBytes(Path.of("META-INF/IDOLACT.RSA"))));
> for (Certificate c : certs) {
>     System.out.println(((X509Certificate) c).getSubjectX500Principal().getName());
> }
> ```
>
> 完整实现在 `CertInfo.java`（临时目录，不入库）。

> ⚠️ **标准基座不等于「不支持 uni-push」**。实测：基座里 `uni.getPushClientId`
> 能正常返回 2.0 的 cid 并上报成功（§4 第 4~6 步），`uni.onPushMessage` 也在。
> 基座**不支持**的是厂商离线通道（小米/华为），那才是 `docs/unipush-offline.md` 的范畴。

---

## 2. 后端指向：`.env.dev` 实际连的是**生产 v2**，不是 69

排查期最大的一个坑：`CLAUDE.md` 的环境变量表写着 `.env.dev` → `http://103.24.218.69:8081/api/v1`，
但**仓库里 `.env.dev` 的实际值是 `https://api.idoltrail.com/api/v1`**（生产 v2 隔离栈）。

用设备上的编译产物直接验：

```bash
adb shell "grep -o -E 'https?://[a-zA-Z0-9.:/_-]*api[a-zA-Z0-9.:/_-]*' \
  /storage/emulated/0/Android/data/io.dcloud.HBuilder/apps/HBuilder/www/app-service.js | sort -u"
# => http://localhost:8081/api/v1     ← env.ts 的 FALLBACK_BASE_URL（兜底，正常不生效）
# => https://api.idoltrail.com/api/v1 ← .env.dev 的真实取值（生产 v2）
```

**后果**：设备上的 App 一律打**生产 v2**（221 的 `idoltrail-backend-api2` + `idoltrail-mysql2`）。
查 69 会得到「零请求」的假象。判断依据别用「我记得 .env.dev 是 69」，**用编译产物和后端日志说话**。

> `docs/unipush-offline.md` §2.3 那段「在 221 上执行」的自检脚本同理指向生产 v2。

---

## 3. 怎么操控这台设备（可复用）

### 3.1 CDP 只能操作 **view 层**，触达不到 service 层

- devtools socket：`webview_devtools_remote_<pid>`（pid = `adb shell pidof io.dcloud.HBuilder`）
- 转发：`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` → `http://127.0.0.1:9222/json`
- 两个 page target：`View`（空壳）与当前业务页（如 `pages/home/index[1]`）
- **service 层（App.vue / 组件逻辑）跑在 `:jse` 进程里，CDP 触达不到**；
  它的 `console.log` 会被转发到 **logcat**（tag `I/console`）—— 这是唯一的 service 层观测口。
- view 层里 `uni` 只有 `navigateTo/navigateBack/reLaunch/redirectTo/switchTab/upx2px`；
  `uni.request` / `uni.getStorageSync` / `uni.getPushClientId` **全是 undefined**，
  在 view 层测这些会得到**误导性结论**（本轮就因此误判过一次「基座不支持 uni-push 2.0」）。

### 3.2 可用的操作手段

| 目的 | 做法 |
|------|------|
| 点按钮 / 切 tab | view 层 `document.querySelector('.cls').click()`（uni-app 的 `@click` 会被真实派发） |
| 填输入框 | `input.value = 'x'; input.dispatchEvent(new Event('input', {bubbles:true}))` |
| 跨页跳转 | view 层 `uni.navigateTo({url:'/pages/xxx'})` |
| 读页面内容 | `document.body.textContent`（**别用 `innerText`**：页面不可见时为空，会误判成「没渲染」） |
| 看 service 层日志 | `adb logcat -d \| grep console` |

### 3.3 几个反直觉的坑

- `mCurrentFocus` 报 `NotificationShade` **不代表 App 不在前台**；
  以 `dumpsys activity activities \| grep ResumedActivity` 为准。
- `dumpsys window` 的 `mCurrentFocus` 与实际渲染层可能不一致（息屏时更明显）。
- 息屏会让 view 层 `window.innerHeight === 0`、元素 rect 全为 0，
  此时**别用坐标点击**，用 class 选择器点击。
- PowerShell 5.1 把含 `"` 的参数传给 native 命令会重新加引号，
  JS 里带双引号就成 `SyntaxError`。**JS 一律写进文件**再让 node 读。
- 换页后 CDP 连接可能断（App 重启 → pid 变 → socket 名变），需重新 `adb forward`。

### 3.4 登录（审核账号）

生产 v2 与 69 都配了审核账号，**绕过真实短信**：

```
手机号 13800138000    验证码 888888
```

App 端仍需勾选《用户协议》《隐私政策》才能提交（`canSubmit` 要求 `agreed`）。
勾选会触发**一键登录探测**并弹出运营商授权页（`io.dcloud.feature.igetui.UniVerifyActivity`），
BACK 取消后走短信验证码即可，**不影响**短信路径。

---

## 4. 已验证通过的链路（生产 v2，user_id `900660977993789440`）

| # | 环节 | 证据 |
|---|------|------|
| 1 | 明文 HTTP 到后端可用 | view 层 XHR 打 `http://103.24.218.69:8081/...` 返回后端 404（说明请求到达） |
| 2 | 首页数据加载 | 首页渲染出深圳 5 个活动（`event-card`），城市 IP 定位失败不影响列表 |
| 3 | 短信登录 | profile 页从「点击登录」变为「用户_8000」，LoginModal 关闭 |
| 4 | **取 2.0 cid** | `[push] getPushClientId 成功 {"keys":["cid","errMsg"]}` |
| 5 | **cid 上报后端** | `[push] cid 上报成功 {"deviceId":"58189139976847339663e2732f7be8b3","platform":"android"}` |
| 6 | 后端落库 | `user_devices` 新增 `device_id=58189139976847339663e2732f7be8b3`，`push_token=459f923a453620cdbe9ae9b457739d24`，`push_provider=unipush`；api2 日志 `POST /api/v1/user/devices/push-token` 200 |
| 7 | 订阅活动 | 活动详情页订阅后图标变 `subscribed.svg`、卡片 `card-stat--subscribed` |
| 8 | 站内通知列表 | `/pages/profile/messages` 渲染 20 条（`msg-card`），含 `msg-card--unread` 未读态 |
| 9 | 通知点击跳转 | 点「马也_Crabbit『海的尽头』2026 巡演」→ 跳到该活动详情页（北京站 2026.12.18） |
| 10 | **已读回写** | api2 日志 `PATCH /api/v1/notifications/903526951105613827/read` 200 → 该条 `is_read=1`（其余为 0） |
| 11 | 未读角标 | 首页铃铛显示 `99+` |
| 12 | 推送开关页 | `/pages/profile/notifications` 正常读到后端设置（场地/时间/阵容/取消/新活动/信息变更 六类开关） |

> 站内通知的**生产端**也是活的：联调期间生产 v2 自己在产生 `new_event` 通知
> （14:13 那条「海的尽头」就是），所以第 8~10 步是**真实闭环**，不是造数据。

---

## 5. 系统通知送达

### 5.1 现象（第一轮，2026-10-29 / `0.1.1` 包）

云函数下发**成功**，设备**零反应**：

```
POST https://dcloud.idoltrail.com/unipush-send
=> {"code":0,"message":"ok","sent":1,"failed":0,"results":[{"errCode":0,"errMsg":"success"}]}  HTTP 200
```

但：
- 设备 `dumpsys notification` 里 `pkg=com.idoltrail.app` 的记录数 = **0**
- App 侧无 `[push] onPushMessage` / `[push] 前台收到消息` 回调
- logcat 无 uni-push **2.0** 的连接建立日志（`CustomGTService` 启动过，但随即被系统 idle 停掉且不重建）

两个包、两个不同 cid 结果一致：

| 包 | cid | 结果 |
|----|-----|------|
| 标准基座 `io.dcloud.HBuilder` | `459f923a453620cdbe9ae9b457739d24` | 云端 errCode 0，设备无通知、无回调 |
| 云打包 `com.idoltrail.app`（`0.1.1`） | `72ef97f293abe98244cfe868336fc464` | 同上 |

> ⚠️ 「App 侧无回调」这条观察在第一轮是**靠 logcat 判的**，而云打包 release 包
> **没有 console 输出**（实测 logcat 里 `console` 行数为 0），所以第一轮
> **无法区分「没收到」与「收到了但看不到日志」**。第二轮改用 HTTP 副作用做判据，
> 发现**其实是收到了**（§5.7）。

### 5.2 已排除的原因

- **不是**签名/协议错：云函数返回 `errCode:0`（签名错会回 `{"code":-1,"message":"非法访问"}`）。
- **不是** cid 为空 / 未登录 / 未上报：见 §4 第 4~6 步，cid 拿到了也落库了。
- **不是** App 侧未注册回调：`initPush()` 里 `uni.onPushMessage` 存在（否则会打
  `[push] uni.onPushMessage 不存在`，logcat 无此告警）。
- **不是**「代码没接 2.0」：标准基座里 `uni.getPushClientId` / `uni.onPushMessage` 都存在，
  2.0 的 cid 能取到并成功上报（见 §4）。
- **不是** App 不在前台：`ResumedActivity` 确认 `com.idoltrail.app/io.dcloud.PandoraEntryActivity` 在前台。

> ⚠️ 第一轮把 `GySDK checkRegister failed errorCode=-20102` 判为
> 「uni-push 1.0 的噪音」——**这也是错的**，第二轮证明它是 2.0 链路的注册失败，
> 且正是离线通道不通的根因（§5.8）。

### 5.3 第一轮的根因判断：**错误**（第二轮已推翻）

> 本节保留原文是为了记录**错在哪**，避免下次重犯同样的误判。

第一轮 §5.3 断言「APK 里没有 uni-push 2.0，注入的是 1.0 的 `GTPushService`」，
依据是解包后没找到 `io/dcloud/feature/aps/*` 的类。

**错在两处**：

| 误判点 | 真相 |
|--------|------|
| ① 「`dcloud_properties.xml` 注入 1.0 的 `GTPushService`」 | 2.0 恰恰就是 `<feature name="Push" value="io.dcloud.feature.aps.APSFeatureImpl">` + `<module name="unipush" value="io.dcloud.feature.unipush.GTPushService"/>`。**module 名字带 `unipush` 才是 2.0**，1.0 的 feature 是 `io.dcloud.feature.push.PushFeatureImpl` |
| ② 「dex 里找不到 `aps` 的类」 | **找法有 bug**：我用正则 `L[a-zA-Z0-9_/\$]+;` 匹配 dex 字符串，但 dex 的 string pool 里每条字符串前有 **ULEB128 长度前缀字节**（`'#'`、`'&'`、`'*'` 等可打印字符），被我的 `strings()` 一起截进来了 → 描述符变成 `'#Lio/dcloud/feature/aps/PushManager;'`，正则匹配不上 → **误判为「不存在」** |

**教训**：判断 dex 里有没有某个类，不能靠「正则扫字符串」。要么用 `dexdump`/`baksmali`，
要么先把长度前缀字节剥掉。这条错误让第一轮把根因指向「要重新云打包」，
实际包里 2.0 早就有了。

---

### 5.6 第二轮：包里确实有 uni-push 2.0（反证）

对 `0.1.2` 云打包包（`idoltrail-012.apk`）重新解包：

**`assets/data/dcloud_properties.xml`（决定性）**：

```xml
<feature name="Push" value="io.dcloud.feature.aps.APSFeatureImpl"/>
<feature name="Push" value="io.dcloud.feature.aps.APSFeatureImpl">
<module name="unipush" value="io.dcloud.feature.unipush.GTPushService"/>
</feature>
<services><service name="push" value="io.dcloud.feature.aps.APSFeatureImpl"/></services>
```

`APSFeatureImpl` = uni-push 2.0 的 Android Push Service 实现。

**classes2.dex 里的 2.0 类**（剥掉长度前缀后可见）：

```
io/dcloud/feature/aps/APSFeatureImpl
io/dcloud/feature/aps/PushManager
io/dcloud/feature/aps/PushChannelManager      ← 厂商通道管理器，2.0 专属
io/dcloud/feature/aps/AbsPushService
io/dcloud/feature/aps/NotificationReceiver
io/dcloud/feature/unipush/GTPushService
io/dcloud/feature/unipush/CustomGTService
io/dcloud/feature/unipush/GTNormalIntentService
```

classes.dex 里另有 `com/getui/gtc/*`（Getui 2.0 传输层，17 个子包）与 `com/igexin/*`（1.0 遗留，被 `GService enabled state: 2` 禁用）。

**运行时佐证**（`10-30 10:17:5x` 冷启动 logcat）：

```
E/DCloud_LOG (11426): channel:com.idoltrail.app|__UNI__F1F9279|128104140210|common;ver:1.9.9.82680
I/app:pushservice(13770): ... com.idoltrail.app:pushservice     ← 2.0 的独立推送进程起来了
D/GTC     (11426): gtcid is gtc_e113b5b868c518da55d133cc36902fb131
```

> ⚠️ `assets/39285EFA.dex` 是 DCloud 加壳加密的 dex（首字节 `cf 77 4c c7`，非 dex magic），
> 运行时才解密。**明文 dex 里找不到某个 DCloud 内部类，不等于包里没有**。

### 5.7 第二轮：在线通道确认打通（A/B 对照实验）

`0.1.2` 包、App **保持前台**（`topResumedActivity=com.idoltrail.app/io.dcloud.PandoraEntryActivity`），
用 api2 访问日志做判据。

**判据选型**：App 在前台收到推送 → `handleForeground` → `useNotificationStore().refreshAfterPush()`
→ 拉 `GET /api/v1/notifications/unread`（`src/stores/notification.ts:349`）。
若通知面板此前加载过，还会并行拉 `GET /api/v1/notifications`。
**云打包 release 包没有 console 输出**，logcat 看不到 `[push] onPushMessage`，只能靠这个 HTTP 副作用反推。

> 排除了自发轮询：`fetchUnreadCount` 只在首页 `onMounted`（`pages/home/index.vue:530`）
> 与登录态 `watch`（同文件 `:598`）调用，**没有任何 `setInterval` 定时器**。

| 组 | 操作 | 40s 内 api2 请求 |
|----|------|-----------------|
| **A（对照）** | App 前台稳定 30s，**不下发**，等 40s | 只有 `HEAD /health`，**`/notifications` 零次** |
| **B（实验）** | App 前台稳定，下发一条，等 40s | **2 次 `GET /api/v1/notifications/unread`**（下发后约 2s） |

```
########## 对照组 A（40s 不下发）##########
  10:44:43.256  HEAD   /health

########## 实验组 B（下发）##########
  10:45:03.580  GET    /api/v1/notifications/unread
  10:45:03.607  GET    /api/v1/notifications/unread
```

**结论：在线（长连接）通道是通的**，推送确实到达了 App 并触发了回调。
（两次是因为 `uni.onPushMessage` 与 `plus.push` 的 receive 同时派发，`handleForegroundOnce`
只做了 1s 窗口去重，跨窗口仍会双刷 —— 见 `usePush.ts:227`。）

### 5.8 第二轮：离线（厂商通道）不通 —— 唯一阻塞点

> ✅ **本节的结论已被第四轮推翻**：小米厂商通道已确认可达，
> 当时的「不通」是**厂商 token 未上报** + **观察窗太短**（45s，厂商聚合要 ~11 分钟）。
> 详见 `docs/unipush-offline.md` §6.3 的实测数据表。以下保留原始记录以备对照。

**测试**（App 被杀 + 进程内 `:pushservice` 也随之消失）：

```bash
adb shell input keyevent KEYCODE_HOME
adb shell am kill com.idoltrail.app        # stopped=false，厂商通道仍可拉起
adb logcat -c
# 下发一条，等待 45s
```

**结果（45s 观察窗）**：

| 观测项 | 结果 |
|--------|------|
| 云函数返回 | `{"code":0,"sent":1,"errCode":0,"errMsg":"success"}`（仅入队） |
| App 是否被厂商通道拉起 | **否**（`pidof` 为空） |
| `dumpsys notification` 中本包 NotificationRecord | **0 条** |
| logcat 里的 mipush 流量 | **0**（只有无关的 `com.miui.weather2` CLEAR_NOTIFICATION） |
| `com.xiaomi.mipush.RECEIVE_MESSAGE` | 本包**无** |

**根因定位（logcat 冷启动序列）**：

```
10:17:54.101 D/Assist_XM (13770): Register mipush, pkg = com.idoltrail.app
10:17:54.122 D/Assist_XM (13770): onReceiveRegisterResult command={register}, resultCode={0},
                                   commandArguments={[MJJxEPWT0rPNx9WnjLTZSIn9Odm3oc+2ghmL3UCcRP0eAWKORjQQE2QR5nIP2gcZ]}
10:17:54.123 E/Assist_MessageManger(13770): other token = XM_MJJxEPWT0rPNx9WnjLTZSIn9Odm3oc+...
10:17:54.198 E/GySDK-Debug(11426): checkRegister failed, response:GYResponse{
                     gyuid='gtc_e113b5b868c518da55d133cc36902fb131', success=false, code=30004,
                     msg='{"errno":0,"data":{"msg":"应用无效，应用不存在","result":"40004"},
                           "errorCode":-20102,"errorDesc":"gysdk appid或者签名无效?"}'}
```

读法：

1. 小米 MiPush **本地注册成功**（`resultCode=0`），拿到了小米 token `XM_MJJx...`；
2. `Assist_MessageManger` 打印 `other token = XM_...` = 要把这个 token **上报**给推送平台；
3. 上报动作依赖 `GySDK` 的注册，**它失败了**：`-20102 应用无效，应用不存在 / gysdk appid或者签名无效`；
4. token 没上报 → 服务端侧没有「cid ↔ 小米 token」的映射 → 下发时无法路由到小米通道 → 设备端零流量。

**第一轮把这条当成了「uni-push 1.0 的噪音」，也是错的**：

- `GySDK-Debug` 这个 tag 所在的类在 `com/g/gysdk/*`（Getui SDK 的 **gysdk** 包），
  不是 1.0 的 `com/igexin/gy/*` —— dex 里**根本没有** `com/igexin/gy/` 这个包；
- 注册端点是 `https://d-gt.getui.com/api.htm` + 路径 `/v2/gy/register`
  （`/v1/gy/inencrypt/register` 是另一个）；
- 报错里的 `gyuid='gtc_e113...'` 带 **`gtc_` 前缀**，与 `D/GTC` 日志里的 gtcid 同值 ——
  **这是 2.0 的 cid**，说明 2.0 的注册流程复用了 gysdk 的注册接口。

所以：**`-20102` 是 2.0 链路的注册失败，不是 1.0 噪音。**

`-20102` 的字面含义「应用无效，应用不存在」+「gysdk appid 或者签名无效」直指
**DCloud 侧登记的 appid / 包名 / 签名指纹与实际打包产物对不上**。

> ⚠️ 但**别急着去改「应用管理 → android证书签名 MD5」**：按 DCloud 官方文档
> （<https://uniapp.dcloud.net.cn/unipush_vendor_config.html>），**指纹只有华为 / 荣耀需要
> （且是 SHA256）**，小米通道要的是 **AppID / AppKey / AppSecret**，与指纹无关。
> 改错地方不会解除 `-20102`。

### 5.9 厂商通道配置（已完成）

> 📌 **章节编号说明**：原 §5.4「待办（需 DCloud 账号）」与 §5.5「送达打通后仍需补的真机验证」
> 在本轮重写时分别并入 §5.9（厂商通道配置）与 §5.11（剩余真机验证），
> 故 §5.4 / §5.5 编号不再使用。

DCloud 开发者中心 → uni-push 2.0 → 厂商推送设置 → 小米：
- **AppID / AppKey / AppSecret**（来自小米开放平台，不是指纹）
- 包名 `com.idoltrail.app`
- 云打包用的是**自定义证书**（`CN=wyh, O=公司名`），不是 DCloud 公共测试证书；
  小米开放平台侧登记的签名必须与之一致（MD5 见 §1 表，各口径对照见
  `docs/unipush-offline.md` §3.2）。

> ⚠️ **指纹只有华为 / 荣耀需要（SHA256）**，小米通道要的是 AppID/AppKey/AppSecret。
> 第一轮把 `-20102` 归因于「指纹填错」是错的。

配好后**必须重新云打包**（厂商凭据是**打包期**注入的）。

### 5.10 剩余待办

1. **华为通道**：DCloud 后台填华为 AppID + **SHA-256 指纹**，小米开放平台侧同理配一遍，
   重新云打包后复测（华为的厂商通道尚未验证过）。
2. **小米通知类别 id**（`channel_id`）：Getui 文档标注必填，实测不传也能送达，
   拿到正式 id 后填云函数环境变量 `UNIPUSH_XM_CHANNEL_ID`。
3. **设备侧（MIUI）**：「省电策略 → 任意后台运行」当前是 `ignore`，
   厂商通道即使下发也可能拉不起进程。需在「设置 → 应用管理 → idoltrail → 省电策略」
   改为**无限制**，并开启**自启动**。

> 详见 `docs/unipush-offline.md`（小米/华为的开通步骤与自检脚本）。

### 5.11 送达打通后仍需补的真机验证

**已补完的部分**（第四轮）：`uni.onPushMessage` → `handleForeground` →
`useNotificationStore().refreshAfterPush()` → 角标/列表刷新，
已在 A/B 对照实验里确认（下发后 2s 内出现 `GET /api/v1/notifications/unread`）。

**仍未验证的部分**（需要设备重连）：

- **点通知栏能否拉起 App**：已定稿 `click_type=startapp`（厂商通道原生支持，
  不依赖 intent 透传），但**小米真机上的点击行为还没实测过**。
  判定：`adb shell pidof com.idoltrail.app` 从空变非空 + 通知栏记录消失。
- **每日限流（每用户每天 2 条）的真机表现**：服务端侧已有单测覆盖
  （`internal/service/push_quota_test.go` + `notification_push_unipush_test.go`），
  但「第 3 条真的不推」需要连发 3 条真机验证。
  → **2026-11-10 起默认不限流**（`UNIPUSH_DAILY_LIMIT` 默认 0），
  这条待办作废；改为「连发 3 条，3 条都要到」作为回归项。

---

## 6. 客户端可观测性增强（本轮顺手修的）

`src/composables/usePush.ts` 之前在不可用时**一行日志都不打**：

| 位置 | 改前 | 改后 |
|------|------|------|
| `initPush()` | `!pushEnabled() \|\| !pluginReady() \|\| inited` → 直接 `return` | 区分「开关关闭 / 插件缺失 / 已初始化」并 `console.warn` 原因 |
| `getPushClientId()` | 插件缺失 → `resolve('')` 静默 | 记原因；`success` 里打**字段名**（不打 cid 本身，cid 是设备凭据会进 logcat） |
| `syncPushToken()` | 未登录 / cid 为空 → `return false` 静默 | 分别记「当前未登录」「未取到 cid」 |
| `App.vue` | 无 | 启动时打一行 `[App] push capability {enabled, pluginReady, reason}` |

诊断日志做了**去重**（同一原因只记一次），否则 `onLaunch`/`onShow`/登录成功三个时机
反复调用会刷屏。行为未变：不可用时仍是 no-op 降级，只是不再「静默」。

真机日志样例：

```
[LOG][App] push capability {"enabled":true,"pluginReady":true,"reason":null}
[LOG][push] getPushClientId 成功 {"keys":["cid","errMsg"]}
[LOG][push] cid 上报成功 {"deviceId":"58189139976847339663e2732f7be8b3","platform":"android"}
[WARN][push] [push] 跳过 cid 上报：当前未登录
```

---

## 7. 复现脚本

临时脚本都在 `C:\Users\trunk\AppData\Local\Temp\uni-agent\`（不入库）：

### 7.1 第一轮（CDP 操作基座）

| 文件 | 用途 |
|------|------|
| `cdp-eval.js` | CDP 求值器：`node cdp-eval.js -f <jsfile> [targetIndex]`，`__ARG__` 占位符由环境变量 `CDP_ARG` 注入 |
| `js/click-by-text.js` | 按文本点击（tab、按钮） |
| `js/click-class.js` | 按 CSS 类点击（订阅按钮、消息卡片） |
| `js/nav.js` | view 层 `uni.navigateTo` / `uni.navigateBack` |
| `js/state.js` / `js/text.js` / `js/popup.js` | 读登录弹窗状态 / 页面文本 / 弹窗与输入框 |
| `js/fill.js` | 填登录表单（手机号 + 验证码） |
| `push-send.sh` | 从 69 的容器取 `UNIPUSH_SECRET`，对指定 cid 下发一条 uni-push（不碰业务数据） |
| `reconnect.ps1` / `restart.ps1` | 重建 CDP 转发 / 重启 App 并重连 |

### 7.2 第二轮（云打包包 + 厂商通道）

| 文件 | 用途 |
|------|------|
| `idoltrail-012.apk` | 被测云打包包副本（`0.1.2`），解包/dex 分析对象 |
| `apk-lineage2.py` / `apk-lineage3.py` / `apk-lineage4.py` | dex 类族/域名/2.0 归属分析（**注意**：字符串提取要剥掉 dex 的 ULEB128 长度前缀字节，见 §5.3） |
| `apk-cid.py` | 验证 cid 是否服务端下发（排除本地拼装） |
| `apk-provider.py` | 扫 provider 标识（`unipush` / `igexin` / `getui`） |
| `apk-regurl.py` | 提取注册端点常量（`/v2/gy/register` 等），用于判定 SDK 代际 |
| `remote221-send-push-a.sh` | 在 221 上取 `UNIPUSH_SECRET` 并下发一条（`__CID__` 占位） |
| `remote221-since.sh` | 打印 api2 中 `ts > __BASE_TS__` 的请求（推送判据） |
| `apilog.ps1` | 把远端 .sh 经 base64 传过去执行（**PowerShell 5.1 下唯一可靠的传参方式**） |
| `ab-test.ps1` | **A/B 对照实验**：不下发 vs 下发，比对 `/notifications` 请求 |
| `final-offline-test.ps1` | 离线通道测试：杀 App → 清 logcat → 下发 → 观察 45s |
| `online-clean-test.ps1` | 在线通道测试：App 稳定 30s → 下发 → 观察 40s |

> ⚠️ **PowerShell 5.1 的两个坑**（这两轮各踩一次）：
> 1. `[IO.File]::ReadAllText($path)` 不传编码参数会抛 `ArgumentException`，必须写
>    `[System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)`；
> 2. 通过 ssh 传 python/多行脚本时，**内层引号会被 PS 重新解析**（`for line in sys.stdin`
>    变成语法错误）。解法：**把远端脚本写成 .sh 文件 → 本地读成字符串 → base64 → ssh 端
>    `base64 -d | bash`**。中文内容一律放远端 .sh，本地 .ps1 保持纯 ASCII。

---

## 8. 附带发现：服务端通知风暴（已修复并双环境验证）

排查 2.0 送达时，顺带发现 **2026-10-28 18:28:53–18:29:10（17 秒）内生产 v2 产生 1503 条通知**，
3 个用户**各 501 条**，横跨 26 个活动，单活动最高 312 条。
DCloud 后台的 RASL 发送记录（`RASL_1028_*`，`toList 1/1/0`）就是这批 unipush 下发——
**不是**设备侧问题，是服务端一次操作被放大成上百条通知。

### 8.1 根因

服务端仓 `internal/repository/subscription.go` 的 `ListCitySubscribersByEvent` 写成了：

```go
Pluck("DISTINCT city", &cities).Where("event_id = ?", eventID)   // ❌
```

GORM 的 `Pluck` 是 **finisher**，其后的 `Where` 不会拼进 SQL，实际执行的是
`SELECT DISTINCT city FROM event_sessions`（**全库 975 个城市**）→ 城市订阅者被全量命中，
一次活动时间变更就变成上百条通知。

### 8.2 修复与验证（服务端仓，2026-10-29）

| 项 | 内容 |
|----|------|
| 提交 | `dbbd36d`（4 个 commit：accesskey 节流 / 通知链序 / 回归用例 / 文档） |
| 部署 | 69 → tag `v0.2.8`（镜像 `idoltrail-server:0.2.8`）；221 v2 → tag `release-v2-20261029c`（镜像 `release-v2-20261029c-dbbd36d`） |
| 决定性回归 | 临时给**上海 region** 插入一名订阅者，改**北京活动**的时间：修复前该用户会收到（取全库城市），修复后 **0 条** |
| 实测结果 | 69 与 221 v2 均：异城订阅者 **0** 条，同城订阅者 + event 直接订阅者**各 1 条**（v2 共 14 人 14 条） |
| 对比 | 修复前同场景**每人 501 条** → 修复后**每人 1 条** |

附带修掉的还有：AccessKey 统计写入的冷却节流 + 旁路连接池（221 v2 之前的宕机根因）、
admin 入口独立限流（20 rps）、批量删除场次时间只发一条合并通知。

> 结论对客户端的意义：**服务端不修的话，App 消息页会被几百条通知刷屏**，
> 看起来像客户端重复推送。客户端本身无需改动。
