# 真机推送联调纪要（2026-10-29）

> 目的：在**真实 Android 设备**上把 App 的通知链路跑一遍，区分「代码问题」与「平台问题」。
> 结论先行：**站内通知链路全通**；**uni-push 2.0 的系统通知送达仍不通，卡在 DCloud 侧**（长连接未建立）。
> 本文记录**可复现的操作方法**与**证据**，避免下次重新踩一遍。

---

## 1. 设备与被测包

| 项 | 值 |
|----|-----|
| 设备 | 小米 `22041216UC`（Redmi），Android 14 / SDK 34，序列号 `HMEUPN8XLJT8XWXS` |
| adb | `C:\Users\trunk\Downloads\HBuilder\HBuilderX\plugins\launcher-tools\tools\adbs\adb.exe`（1.0.41 / 35.0.2-12147458） |
| 被测包 A | `io.dcloud.HBuilder`（**标准运行基座** 15.33）→ 跑**当前工作区代码** |
| 被测包 B | `com.idoltrail.app`（**云打包**正式包，versionName 0.1.1 / versionCode 10，2026-10-28） |

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

## 5. 仍然不通的：uni-push 2.0 的**系统通知送达**

### 5.1 现象

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
| 云打包 `com.idoltrail.app` | `72ef97f293abe98244cfe868336fc464` | 同上 |

### 5.2 已排除的原因

- **不是**签名/协议错：云函数返回 `errCode:0`（签名错会回 `{"code":-1,"message":"非法访问"}`）。
- **不是** cid 为空 / 未登录 / 未上报：见 §4 第 4~6 步，cid 拿到了也落库了。
- **不是** App 侧未注册回调：`initPush()` 里 `uni.onPushMessage` 存在（否则会打
  `[push] uni.onPushMessage 不存在`，logcat 无此告警）。
- **不是**「代码没接 2.0」：标准基座里 `uni.getPushClientId` / `uni.onPushMessage` 都存在，
  2.0 的 cid 能取到并成功上报（见 §4）。
- **不是** App 不在前台：`ResumedActivity` 确认 `com.idoltrail.app/io.dcloud.PandoraEntryActivity` 在前台。

> 关于 `GySDK checkRegister failed errorCode=-20102「应用无效，应用不存在」`：
> 这是 **uni-push 1.0**（Getui 1.0 SDK）的噪音，该 AppID 没开 1.0；
> 2.0 走 `io.dcloud.unipush` provider，与它无关。但它同时暴露了下面的事实：
> **打出来的包里，Push 能力注入的就是 1.0 实现。**

### 5.3 已定性的根因：云打包时**没有注入 uni-push 2.0 module**

`src/manifest.json` 的配置本身是**对的**（HEAD 就已包含）：

```json
"app-plus": {
  "modules": { "Push": {} },
  "distribute": { "sdkConfigs": { "push": { "unipush": { "version": "2", "offline": true } } } },
  "uni-push": { "push-type": "unipush" }
}
```

但 **APK 里没有 2.0 的 SDK**，证据（解包 `com.idoltrail.app` 的 APK）：

| 证据 | 内容 | 结论 |
|------|------|------|
| `assets/data/dcloud_properties.xml` | `<feature name="Push" value="io.dcloud.feature.aps.APSFeatureImpl"><module name="unipush" value="io.dcloud.feature.unipush.GTPushService"/></feature>` | 注入的是 **1.0** 的 `GTPushService` |
| dex 内的推送类 | 只有 `com.getui.gtc.*` / `com.igexin.*`（1.0 SDK） | **无** uni-push 2.0 SDK |
| `assets/data/dcloud_control.xml` | 有 `appid="__UNI__F1F9279"`，**无 push 节点** | 2.0 的 push 段未写入 |
| `assets/supplierconfig.json` | 仅 vivo appid，xiaomi / huawei / oppo **全空** | 厂商通道未配置 |

**厂商通道是在打包时注入的**：通道没批下来 → 打包不带 2.0 → 2.0 长连接自然起不来。
这与 logcat 完全吻合：`io.dcloud.feature.unipush.CustomGTService` 启动后 1 分钟即被系统
`Stopping service due to app idle` 停掉且不重建 → 长连接没建起来，
典型的「鉴权/注册失败后不重试」表现。

> 云端 `sendMessage` 对**未注册的 cid** 依然返回 `errCode:0`（只代表任务入队），
> **不代表已投递**——`errCode:0` 在这里不能作为送达证据。

**结论**：必须等 DCloud 厂商通道配好之后**重新云打包**，新包才会带 2.0 SDK 与厂商配置。

### 5.4 待办（需要 DCloud 账号，客户端改不了）

1. DCloud 开发者中心 → 应用 `__UNI__F1F9279` → **uni-push 2.0**：确认服务已开通
2. 同页配置**小米 / 华为 / OPPO / vivo** 厂商通道凭据（AppID、包名、证书指纹）
3. **重新云打包**（2.0 module 与厂商通道都在打包时注入，旧包不会自动带上）
4. 装新包 → 登录 → 确认 `user_devices` 有新 cid → 再下发 → 观察系统通知栏

> 详见 `docs/unipush-offline.md`（小米/华为的开通步骤与自检脚本）。

### 5.5 送达打通后仍需补的真机验证

`uni.onPushMessage` → `handleForeground` → `useNotificationStore().refreshAfterPush()`
→ 角标/列表刷新 这段**依赖送达**，本轮无法端到端验证；后端 dispatch 逻辑侧已由
服务端仓的 integration e2e 覆盖（`TestAdminEventNotifyE2E` 12 个子步骤 +
`TestBatchDeleteTimesNotifiesOnce`）。

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

| 文件 | 用途 |
|------|------|
| `cdp-eval.js` | CDP 求值器：`node cdp-eval.js -f <js文件> [targetIndex]`，`__ARG__` 占位符由环境变量 `CDP_ARG` 注入 |
| `js/click-by-text.js` | 按文本点击（tab、按钮） |
| `js/click-class.js` | 按 CSS 类点击（订阅按钮、消息卡片） |
| `js/nav.js` | view 层 `uni.navigateTo` / `navigateBack` |
| `js/state.js` / `js/text.js` / `js/popup.js` | 读登录弹窗状态 / 页面文本 / 弹窗与输入框 |
| `js/fill.js` | 填登录表单（手机号 + 验证码） |
| `push-send.sh` | 从 69 的容器取 `UNIPUSH_SECRET`，对指定 cid 下发一条 uni-push（不碰业务数据） |
| `reconnect.ps1` / `restart.ps1` | 重建 CDP 转发 / 重启 App 并重连 |

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
