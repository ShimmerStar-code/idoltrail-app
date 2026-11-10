# uni-push 2.0 离线推送（小米 / 华为）接入指南

> 目标：让 App 在**被系统回收 / 未打开**时，依然能收到订阅活动的变更提醒。
> 机制：uni-push 2.0 的 `offline:true` 模式会把消息交给**设备厂商的推送通道**
> （小米 MiPush、华为 HMS Push），由厂商在系统层唤醒 App。
>
> 参考：DCloud 官方《uni-app 默认集成功能模块 · UniPush / HMS push》
> <https://uniapp.dcloud.net.cn/app/android-store.html#unipush>

---

## 1. 当前进度

| 环节 | 状态 | 位置 |
|------|------|------|
| 客户端编译期开关（version 2 / offline） | ✅ 已配 | `src/manifest.json` → `app-plus.distribute.sdkConfigs.push.unipush` |
| 厂商通道占位声明（`mi` / `honor`） | ✅ 已配 | 同上，`unipush.mi` / `unipush.honor` |
| App 模块勾选 Push | ✅ 已勾 | `src/manifest.json` → `app-plus.modules.Push` |
| 客户端取 cid 并上报后端 | ✅ 已实现 | `src/composables/usePush.ts` → `syncPushToken()` |
| 后端推送通道开关 | ✅ 已开 | 正式 v2：`.env.prod` 的 `UNIPUSH_ENABLED=true` 等 5 项 |
| 云函数 `unipush-send` 中转 | ✅ 已通 | `uniCloud-alipay/cloudfunctions/unipush-send/index.js` |
| **包内确实含 uni-push 2.0 SDK** | ✅ 已确认（2026-10-30） | 解包 `0.1.2` 云打包包：`dcloud_properties.xml` = `io.dcloud.feature.aps.APSFeatureImpl`；classes2.dex 含 `aps/{PushManager, PushChannelManager, AbsPushService}` |
| **在线（长连接）通道送达** | ✅ 已确认（2026-10-30） | A/B 对照实验：下发后 2s 内出现 2 次 `GET /api/v1/notifications/unread`；不下发则 40s 内为 0 |
| **离线（厂商通道）送达** | ✅ 已确认（2026-10-30） | `am kill` 后下发，回执 `successed_offline`，**约 11 分钟后**通知栏出现且 App 进程被厂商通道唤起（见 §6.3） |
| **通知栏点击只打开 App** | ✅ 已定稿（`click_type=startapp`） | 云函数 `unipush-send`；点击不再依赖厂商透传 intent（见 §6.6） |
| **每日推送限流（每用户每天 2 条）** | ⚠️ 已实现但**默认关闭**（2026-11-10 起） | Go 后端 `UNIPUSH_DAILY_LIMIT`（默认 **0 = 不限**）；限流按用户计数，会把用户最关心的偶像改期一并丢掉，确需限流时用环境变量显式开启（见 §6.6） |
| **DCloud 后台离线推送配置（小米/华为凭据）** | ✅ 已配（小米可用，华为未验证） | DCloud 开发者中心 → uni-push → 离线推送 |
| **厂商平台侧开通（AppID / 证书 / 包名绑定）** | ✅ 小米已开通 | 小米开放平台、华为 AppGallery Connect |
| **重新云打包**（厂商凭据是打包期注入） | ✅ 已完成 | HBuilderX 发行 → 云打包（含 Push 模块） |
| **小米通知类别 id（`channel_id`）** | ⬜ 待申请（不阻塞送达） | 实测不传也能送达；拿到后填 `UNIPUSH_XM_CHANNEL_ID`（见 §6.5） |
| 隐私政策披露 | ✅ 已补 | 《隐私政策》「六、第三方服务与 SDK 清单」 |

> ⚠️ 离线通道**必须用含 Push 模块的自定义基座或云打包包**安装，标准 HBuilder 运行基座
> 不含厂商通道，推送会静默失败。

> ⚠️ **在线与离线通道都已实测打通**（2026-10-30，详见
> [`docs/device-push-test.md`](./device-push-test.md) §5.7～§5.9 与本文 §6）：
> 在线走个推长连接（约 2s 到达），离线由**小米厂商通道**投递（回执 `successed_offline`，
> **约 11 分钟后**通知栏出现，App 进程被唤起）。
> 早期「App 被杀后设备端零流量」的根因是 **厂商 token 没上报**（小米 MiPush 本地注册成功，
> 但 `GySDK checkRegister failed errorCode=-20102「应用无效，应用不存在 / gysdk appid 或者签名无效」`
> 让上报失败 → 服务端没有 cid↔小米 token 的映射 → 无法路由到小米通道）；
> `-20102` 直指 **DCloud 后台登记的 appid / 包名 / 签名指纹与实际打包产物对不上**，
> 本包用的是**自定义证书**（非 DCloud 公共测试证书），指纹见
> [`docs/device-push-test.md`](./device-push-test.md) §1。
>
> ⚠️ `errCode:0` 只代表任务入队，**不代表送达**。判断送达要看设备侧证据：
> App 前台 → api2 有 `/notifications` 请求；App 后台 → 通知栏有记录 + logcat 有 mipush 流量。

---

## 2. 代码侧已就绪的部分

### 2.1 manifest

```jsonc
"app-plus": {
  "modules": { "Push": {} },
  "distribute": {
    "sdkConfigs": {
      "push": {
        "unipush": {
          "version": "2",      // uni-push 2.0
          "offline": true,     // ★ 必须 true：解析到 dist/uni-push.plus.es.js（厂商通道）
          "mi": {},            // ★ 小米通道占位，缺失则小米机型收不到
          "honor": {}          // ★ 荣耀通道占位
        }
      }
    }
  }
}
```

`offline:false` 时走个推 GtPush 长连接（`wss://wshzn.gepush.com`），
后台极易被系统杀死，且 iOS 根本没有保活长推送机制（iOS 只能靠 APNs）。

### 2.2 客户端取 cid

`src/composables/usePush.ts`：

- `getPushClientId()` → `uni.getPushClientId()` 取本机 cid
- `syncPushToken()` → 登录后（`onLaunch` / `onShow` / 登录成功三个时机）幂等上报
  `POST /api/v1/user/devices/push-token`，后端按 `(device_id, push_token)` upsert
- `initPush()` → 注册 `uni.onPushMessage` + `plus.push` 的 receive / click 回调
- 点击跳转统一走 `resolvePushUrl()`：优先用 `payload.url`，否则由
  `relatedType` + `relatedId` 推导（与站内通知路径一致）

> 排查提示：设备没有 cid → 库里 `user_devices` 无该设备 → 绝大多数情况是
> 装的包**不含 Push 模块**，或 DCloud 后台未给该 AppID 开通推送服务。
>
> `usePush.ts` 现在**不静默失效**：启动会打 `[App] push capability {enabled, pluginReady, reason}`，
> 取不到 cid / 未登录 / 上报失败都有对应的 `[push] ...` 日志（同一原因只打一次）。
> 排查先看这几行，别靠猜。

### 2.3 服务端下发链路

```
服务端（通知变更）→ internal/pkg/push/unipush.go
   → POST {UNIPUSH_CLOUD_URL}（云函数 unipush-send，HMAC-SHA256 验签）
   → uniCloud.getPushManager({appId}).sendMessage()  ← 官方下发，厂商通道在这里生效
```

**链路自检**（不需要真机，用假 cid 验签名与云函数连通性）：

> ⚠️ 这段脚本在 **221** 上执行，读的是 **生产 v2** 的 `.env.prod`；
> **69** 上的容器同样配了 `UNIPUSH_*`，但 69 与 221 的 `UNIPUSH_SECRET` 是同一份
> （同一个 DCloud 账号），任选其一即可。**自检只能证明「云函数通」，
> 证明不了「设备收得到」**——`errCode:0` 只代表任务入队。

```bash
# 在 221 上执行，secret 不出本机
python3 - <<'PY'
import hmac,hashlib,json,urllib.request
env=dict(l.strip().split('=',1) for l in open('/home/dev/idoltrail-backend-v2/.env.prod') if '=' in l)
cids=['fake-cid-link-test-0001']
payload=json.dumps({"relatedType":"event","relatedId":"0"},separators=(',',':'))
p={"appid":env['UNIPUSH_APP_ID'],"clientids":",".join(cids),"title":"自检","content":"自检","payload":payload}
sign=hmac.new(env['UNIPUSH_SECRET'].encode(),"&".join(f"{k}={p[k]}" for k in sorted(p)).encode(),hashlib.sha256).hexdigest()
body=dict(p); body["clientids"]=cids; body["sign"]=sign
r=urllib.request.Request(env['UNIPUSH_CLOUD_URL'],data=json.dumps(body,ensure_ascii=False).encode(),headers={'Content-Type':'application/json'})
print(urllib.request.urlopen(r,timeout=30).read().decode())
PY
# 期望：{"code":0,"message":"ok","sent":1,...,"errMsg":"success"}
```

> ⚠️ 签名时 `clientids` 用**逗号连接后的字符串**（Go 侧 `strings.Join(cids, ",")`），
> body 里仍发数组；写成数组会验签失败，云函数只回 `{"code":-1,"message":"非法访问"}`。

---

## 3. 待办一：DCloud 开发者中心配置离线推送

路径：**DCloud 开发者中心（dev.dcloud.net.cn）→ 应用 __UNI__F1F9279 → uni-push 2.0 → 厂商推送设置**

各厂商要填什么，按 DCloud 官方文档《安卓、鸿蒙厂商推送配置》
（<https://uniapp.dcloud.net.cn/unipush_vendor_config.html>）：

| 厂商 | 在 DCloud 开发者中心填 | 厂商平台侧要准备 |
|------|------------------------|------------------|
| **小米 MiPush** | **AppID / AppKey / AppSecret**（不要指纹） | 小米开放平台创建应用，拿 AppID/AppKey/AppSecret，登记包名 |
| 华为 HMS Push | AppID / AppSecret / 包名 / `agconnect-services.json` 内容 | AppGallery Connect 建应用，**项目设置 → 常规**填 **SHA256 证书指纹**，并开通推送服务 |
| 荣耀 | AppID / ClientID / ClientSecret | 荣耀开放平台申请推送服务，需填 **SHA256 证书指纹** |
| OPPO / vivo / 魅族 | 对应 AppID / AppKey / AppSecret | 对应开放平台创建应用 |

> ⚠️ **指纹只对华为 / 荣耀有意义（且是 SHA256，不是 MD5）**。
> 小米通道不需要任何指纹，靠 AppID/AppKey/AppSecret + 包名。
> 改「应用管理 → android证书签名 MD5」**不会**解除小米的 `-20102`。

未配置的厂商，对应品牌设备**收不到系统通知**（会静默降级为在线通道，App 在前台才有）。

### 3.1 厂商配置是「打包期注入」，改完必须重新云打包

厂商凭据**不写在 `src/manifest.json` 里**，但在云打包时会被 DCloud 从开发者中心拉取并注入包内
（产物就是 `assets/supplierconfig.json`）：

```json
{"supplier":{"vivo":{"appid":"100215079"},"xiaomi":{},"huawei":{},"oppo":{}}}
```

`vivo` 有 appid 而 `xiaomi` 是空对象 —— 说明**云打包时该厂商的凭据没注入包内**，
核对开发者中心的厂商推送设置是否已填小米 AppID/AppKey/AppSecret。
⚠️ 但**不能只凭这个文件就断定通道不通**：实测 `xiaomi` 为空的包，小米通道照样能离线送达
（厂商凭据与下发通道由 DCloud 服务端侧持有，`supplierconfig.json` 只是打包期注入的 SDK 侧配置）。
通道到底通不通，以 §6.3 的实测为准。

`src/manifest.json` 侧只需保证离线推送已开启（决定是否集成厂商 SDK）：

```jsonc
"sdkConfigs": {
  "push": {
    "unipush": {
      "version": "2",      // 启用 uni-push 2.0
      "offline": true      // 走厂商通道（离线推送），缺这个就只有在线长连接
    }
  }
}
```

HBuilderX 提交打包时会把 `app-plus.distribute.sdkConfigs.push.unipush` 整段上传给云端，
云端再与开发者中心的厂商配置合并（`plugins/uniapp-extension/out/index.js`：
`const t = getProjectManifestInfo(projectDir, "app-plus.distribute.sdkConfigs.push") || {};
e.Push && t.unipush && (D.unipush = t.unipush);`）。

> ⇒ **改完开发者中心的厂商配置，必须重新云打包并覆盖安装**，否则老包里没有注入凭据。

### 3.2 本项目云打包签名证书指纹

本项目用**自定义证书**（不是 DCloud 公共测试证书）。厂商平台侧登记的指纹必须是它：

| 项 | 值 |
|----|-----|
| 包名 | `com.idoltrail.app` |
| Subject | `CN=wyh, OU=rd, O=六等星夜（北京）科技有限责任公司, L=beijing, ST=beijing, C=CN` |
| 序列号 | `55d08c20` |
| 有效期 | 2024-09-19 17:06:17 CST ~ 2052-02-05 17:06:17 CST |
| 签名算法 | SHA256withRSA，RSA 2048 bit |
| 证书来源 | APK 内 `META-INF/IDOLACT.RSA` |

**MD5 口径对照表**（同一个证书，7 种算法都列出来，按厂商后台要求挑）：

| 口径 | 算法 | 值（连续大写） | 值（连续小写） |
|------|------|---------------|---------------|
| **A1** | MD5(证书 DER 字节) | `7BFCD8E571D4E43406346A6213A85663` | `7bfcd8e571d4e43406346a6213a85663` |
| **A2** | MD5(证书 DER 字节)，冒号分隔 | `7B:FC:D8:E5:71:D4:E4:34:06:34:6A:62:13:A8:56:63` | `7b:fc:d8:e5:71:d4:e4:34:06:34:6a:62:13:a8:56:63` |
| B1 | MD5(SHA1 大写连续) | `B96E79BF72D7649EB0E68D7EC6CBE6C5` | 同左（仅大小写区分） |
| B2 | MD5(SHA1 小写连续) | `E0CEF519E761D77E1DBD8EA8C6BCCCE7` | 同左 |
| B3 | MD5(SHA1 大写冒号) | `7DFC5D7B95F5CD3A7F4DEBA1A8F5880E` | 同左 |
| B4 | MD5(SHA1 小写冒号) | `4F5A665FFF06CDB2D9B71F47A924755E` | 同左 |
| **C1** | MD5(DER 的小写 hex 串) | `50187280640DF2AD9D540DF8603AB3F2` | **AGP `signingReport` 口径** |
| C2 | MD5(DER 的大写 hex 串) | `010ABC436CAE7ED771D6CB2F2B32A6A9` | 同左 |

SHA-1 / SHA-256（华为、荣耀要的是这个）：

| 口径 | 连续大写 | 连续小写 | 冒号分隔（大写） |
|------|---------|---------|----------------|
| SHA-1 | `B1D418CBBCAD4296D1F679CC1B2C82ADD2A2A552` | `b1d418cbbcad4296d1f679cc1b2c82add2a2a552` | `B1:D4:18:CB:BC:AD:42:96:D1:F6:79:CC:1B:2C:82:AD:D2:A2:A5:52` |
| SHA-256 | `213D556F54FF7FD3050B951DAF978D228AAE6527559892AFB75AD9BED7A07699` | `213d556f54ff7fd3050b951daf978d228aae6527559892afb75ad9bed7a07699` | `21:3D:55:6F:54:FF:7F:D3:05:0B:95:1D:AF:97:8D:22:8A:AE:65:27:55:98:92:AF:B7:5A:D9:BE:D7:A0:76:99` |

> **A1 = apksigner 的输出**（`apksigner verify --print-certs` 打印的
> `MD5 digest: 7bfcd8e571d4e43406346a6213a85663`），也是**绝大多数厂商后台**要的口径。
> 报「android证书签名填写错误，请填写正确的MD5」时，优先试 **A1 连续小写 32 位**，
> 报格式错（要冒号）就试 **A2**，微信/支付宝类要求 **C1**。
>
> 取指纹（apksigner 在 HBuilderX 里就有，不用另装 SDK）：
>
> ```bash
> java -jar "C:\Users\trunk\Downloads\HBuilder\HBuilderX\plugins\app-safe-pack\apksigner.jar" \
>   verify --print-certs <你的.apk>
> ```
>
> 上面这组值由 `keytool -printcert -jarfile <apk>`、apksigner、Java `CertificateFactory`
> **三方对账一致**（DER 字节逐字节相同），可直接填。
>
> **指纹填错 = 设备端收 `-20102` = 离线通道静默不通**（实测现象，见 §6 常见问题）。
> 换证书（正式证书 → 测试证书，或反之）后必须同步更新 DCloud 与厂商两侧，并重新云打包。

---

## 4. 待办二：厂商平台侧开通

### 4.1 小米

1. 小米开放平台（<https://dev.mi.com>）→ 管理控制台 → 消息推送 → 创建手机/平板应用，
   填写**应用名称**与**应用包名** `com.idoltrail.app`，勾选同意接入协议后启用。
2. 开通「消息推送（MiPush）」服务，拿到 **AppID / AppKey / AppSecret**。
   （小米会校验应用签名，登记的签名必须与最终发版包一致 —— 见 §3.2 指纹表。）
3. 在 **DCloud 开发者中心 → 厂商推送设置 → 小米** 填入 AppID / AppKey / AppSecret。
4. **重新云打包**（厂商配置是打包期注入，见 §3.1）。

### 4.2 华为

1. AppGallery Connect（<https://developer.huawei.com/consumer/cn/service/josp/agconnect/index.html>）
   创建应用，登记 Android 包名 `com.idoltrail.app`。
2. 「项目设置 → 常规」填 **SHA256 证书指纹**（取 §3.2 的 SHA-256），
   「项目设置 → 增长 → 推送服务」开启推送服务，拿到 **App ID** 与 **SecretKey**。
3. 下载 `agconnect-services.json`，在 **DCloud 开发者中心 → 厂商推送设置 → 华为**
   填 AppID / AppSecret / 包名 / 该 json 内容。
4. **重新云打包**。

> ⚠️ 华为通道在 Android 上还需要设备侧已登录华为账号且系统开启「允许 App 后台弹出通知」，
> 详见华为 Push Kit 文档。

---

## 5. 待办三：云打包 + 自测

1. HBuilderX → 发行 → 原生 App-云打包，确认：
   - App 模块勾选 **Push**
   - 使用**正式证书**（否则厂商侧证书指纹不匹配）
2. 覆盖安装到设备，登录 App（**必须登录**，cid 上报接口要鉴权）。
3. 自检：库里应出现该设备的 `user_devices.push_token`。

```sql
select device_type, device_model, app_version, push_token, created_at
from user_devices order by id desc limit 5;
```

4. **离线通道自测（真离线，必须让 App 被杀）**：

   ```bash
   adb shell input keyevent KEYCODE_HOME
   adb shell am kill com.idoltrail.app     # stopped=false，厂商通道仍可拉起
   adb logcat -c
   # 下发一条推送（见 §2.3 的云函数脚本）
   sleep 900                              # ⚠️ MIUI 厂商通道有分钟级聚合延迟，实测约 11 分钟
   adb shell dumpsys notification --noredact | grep -i idoltrail   # 应有 NotificationRecord
   adb shell pidof com.idoltrail.app       # 应出现新进程（小米通道唤起 App）
   adb logcat -d | grep -iE "xiaomi.mipush|XMPush"                 # 应有本包的流量
   ```

   **期望**：通知栏出现通知 + logcat 有 `com.xiaomi.mipush.RECEIVE_MESSAGE`（本包）。
   若只有 `com.miui.weather2` 之类无关流量，说明**厂商通道没通**，回 §3 核对指纹与凭据。

   > ⚠️ **App 留在后台（进程存活）不算离线测试** —— 此时走的是在线长连接，
   > 收得到不能证明厂商通道通了。**必须 `am kill`**。
   > ⚠️ **不要在 10 分钟内判失败**：厂商通道送达有分钟级延迟，
   > 详见 §6.3 的实测数据与 §6.4 的判据（`channel=Default` + 真实 `when` +
   > `deleteIntent=startService` 才是厂商通道送达的特征）。
   > 同理，App 在前台时**不弹系统通知是产品刻意设计**（见 `usePush.ts` 注释），
   > 前台应改看 `/notifications` 请求是否出现（判据见 §7 末）。

5. **在线通道自测（对照用）**：App 前台稳定 30s → 下发 → 看 api2 日志是否出现
   `GET /api/v1/notifications/unread`。不做 A/B 对照的话，无法排除「首页 onMounted
   自己拉的」干扰（`fetchUnreadCount` 只在首页 `onMounted` 与登录态变化时调用，
   没有定时轮询）。

---

## 6. 下发链路：实测结论与定稿（2026-10-30）

### 6.1 为什么不能用 uni-cloud-push 扩展库下发通知栏消息

扩展库 `uni-cloud-push`（`plugins/unicloud/internal-functions/common/uni-cloud-push/index.js`）
的 `getPushMessage()` 里，「通知消息形态」与「payload 随 intent 透传」是**互斥**的：

| 传参 | `push_message` 形态 | 后果 |
|------|-------------------|------|
| 不传 `open_url` | `{transmission: ...}` | 站内消息/透传形态，**不创建系统通知栏** |
| 传 `open_url` | `{notification: ...}` | 扩展库随即把 `click_type` 改成 `"url"` 并 `delete intent` → **payload 丢失**，点通知栏变成用浏览器开网页 |

`options` 只能覆盖 `push_channel.*.options`，**覆盖不了 `notification` 本身**；
`force_notification` 只写进 transmission 的 JSON 里，不改变消息形态。
⇒ **扩展库无法同时做到「通知栏消息 + payload 随点击透传」**。

### 6.2 定稿方案：云函数直连个推（Getui）下发 notification

`uniCloud-alipay/cloudfunctions/unipush-send/index.js` 里的 `sendNotificationDirect()`：

1. **鉴权**：`sha256(appkey + timestamp + mastersecret)` → `POST /v2/{getuiAppid}/auth`，
   token 缓存在 `opendb-tempdata` 的 `uni-push-token-{appid}`。
   ⚠️ URL 里必须用**个推 appid**（`pushConfig.appId`，21 位，如 `8LSaaD9EOF85iM46pa3mM`），
   用 DCloud AppID（`__UNI__F1F9279`）会返回 `appid is invalid`。
   ⚠️ `process.env.UNICLOUD_PUSH_CONFIG` 在云函数里**不存在**，但
   `uniCloud.getPushManager({appId}).pushConfig` 能直接读到 `mastersecret`。
2. **任务模式**：`POST /push/list/message` 建任务拿 `taskid` → `POST /push/list/cid` 绑设备。
   单播 `/push/single/cid` 语义是「此刻在线才投递」，设备离线时没有离线投递计划。
3. **消息体**：`push_message.notification` 与 `push_channel.android.ups.notification`
   给同一份内容，`click_type: "intent"`，`intent` 里带
   `S.payload=<业务 payload>`、`S.title`、`S.content`、`S.unipush_version=2.0`，
   `component=<包名>/io.dcloud.PandoraEntry`。
4. **`settings.strategy.default`**：默认 **1**（在线走个推长连接 / 离线走厂商通道）。
   实测两条路都会创建系统通知栏。
5. **`settings.ttl`**：7200000（2 小时），决定离线消息的保留时长。

### 6.3 实测数据（设备：Redmi 22041216UC / Android 14 / MIUI）

| 场景 | strategy | Getui 回执 | 通知栏 | 延迟 |
|------|----------|-----------|--------|------|
| App 在线（前台） | 3（只个推） | `successed_online` | ✅ 出现（`channel=Default`） | **~2 秒** |
| App 被杀（`am kill`） | 1 | `successed_offline` | ✅ 出现，且 `pidof` 出现新进程（小米通道唤起 App） | **~11 分钟** |

> ⇒ **厂商通道是通的，但 MIUI 侧有分钟级聚合延迟**。
> 历史教训：早期用「等 45 秒」判定离线送达，把**延迟送达**误判成「通道不通」，
> 反复改代码方向。**离线送达必须等 10 分钟以上再下结论。**

### 6.4 判据：怎么区分「厂商通道送达」与「App 进程内自建通知」

`adb shell dumpsys notification --noredact` 里每条 `NotificationRecord` 的特征：

| 特征 | App 进程内创建（在线通道 / 扩展库 transmission） | 厂商通道送达（小米） |
|------|------------------------------------------|-------------------|
| `channel` | `DcloudChannelID` | `Default` |
| `when` | `0` | 真实时间戳 |
| `deleteIntent` | `null` | `startService` |

`channel=Default` + 真实 `when` + `deleteIntent=startService` ⇒ **系统/厂商通道直接创建**，不依赖 App 进程。

### 6.5 小米 `channel_id`

个推文档标注 `options.XM["/extra.channel_id"]`「推送时必须要设置，否则请求小米推送接口会返回失败」。
本项目**未申请**该值（小米开放平台「消息分类」报备后才有），实测**不传也能送达**（小米按默认分类下发）。
一旦申请到正式 id，配环境变量 `UNIPUSH_XM_CHANNEL_ID` 即可，云函数会自动塞进 `options.XM`。

### 6.6 定稿方案：通知栏只做「聚合提示」，点击只打开 App

**产品口径（2026-10-30 定）**：

| 项 | 口径 |
|----|------|
| 通知栏的角色 | **聚合提示**：点开 App 即可，具体是哪条消息由 App 内部的站内通知列表承载 |
| 点击行为 | `click_type: "startapp"` —— **只打开 App，不带跳转参数** |
| 跳转 | 站内通知（`notifications` 表）全量落库，用户在 App 通知中心看全部更新 |
| 频次 | **默认不限**（每用户每天最多 2 条的限流已默认关闭，见下） |

**为什么用 `startapp` 而不是 `intent`**：

- `startapp` 是厂商通道（小米/华为/OPPO/vivo）notification 的**原生支持**的点击类型，
  系统直接拉起 App，**不依赖厂商是否原样透传我们自定义的 intent**。
- 选它同时解决了 §6.7 记录的两个硬问题：intent 透传丢失、冷启动点击 App 不被拉起。
- 代价：点通知**不能**精确跳到那一条消息 —— 这正是产品要的效果（聚合提示）。

> ⚠️ **厂商侧兼容度未逐家验证**：厂商通道把 `click_type` 透传给各家 SDK，
> 小米实测可用（点通知能拉起 App），华为/OPPO/vivo 未验证。
> 若某家不认 `click_type=startapp`，表现是「点了没反应」或「按普通通知处理」，
> 此时可临时把云函数环境变量 `UNIPUSH_CLICK_TYPE` 改回 `intent`（行为退回 §6.7 的形态）。
> **改环境变量不需要重新部署云函数，但需要一次冷启动生效**（云函数环境变量变更会重启实例）。

**落地位置**：

| 层 | 改动 |
|----|------|
| 云函数 `unipush-send` | `click_type` 默认 `startapp`（`UNIPUSH_CLICK_TYPE` 可切换 `intent`/`payload`/`both`） |
| Go 后端 `config` | `UniPushDailyLimit`（env `UNIPUSH_DAILY_LIMIT`，默认 **0 = 不限**，确需限流时显式设置） |
| Go 后端 `pushUniPush()` | 每日限量（默认关闭）：统计 `notifications` 表里 `channel=unipush 且 push_status=sent` 的当日条数，达上限记 `skipped` 并写明原因 |
| App 端 | **无需改动**：`navigateByPush()` 已有 `if (!url) return` 保护，空 payload 不会误跳转 |

> 限流只作用于**系统推送**；站内通知落库不受影响，用户在通知中心仍能看到全部更新。
> 统计故障时**不阻断下发**（宁可多推一条，也不要因为计数失败把推送全停了）。
>
> **计数口径与并发**（服务端实现，详见
> `idoltrail-server-main/internal/service/push_quota.go`）：
>
> | 项 | 取值 |
> |----|------|
> | DB 计数 | `notifications` 表里 `channel=unipush` 且 `push_status=sent` 且 `delivered_at >= 当日零点` 的行数（用 `delivered_at` 而非 `created_at`：前者是「推送成功时间」，正是要计的那件事） |
> | 在途计数 | 本进程已下发但审计还没写回的条数（补并发窗口，见下） |
> | 判定方式 | **先占位再判断** —— 占位在进程内原子，两个并发 dispatch 只有一个能抢到最后一个名额 |
> | 释放时机 | 审计写回后（DB 计数接管）或下发失败时（用户没收到，不占额度） |
> | 同一用户多设备 | 算**一条**通知（只占一个名额），但**所有设备都下发** |
> | 跨天 | 按自然日重置（本地时区） |
>
> 为什么需要「在途计数」：审计是在下发**之后**才回写的，
> 一次活动变更可能同时改时间、改阵容（各起一个 goroutine），
> 两个 dispatch 会**同时**读到「今天还没推过」→ 一起通过检查 → 用户在一个突发里收到多条。
> 只看 DB 计数会有这个窗口；在途计数补上它（名额归属精确到 `(owner, user)`，
> 释放时不会误放掉并发 dispatch 的名额）。
>
> 已知可接受偏差：多通道合并时 `channel` 按 `sent > failed > skipped` 取优先级，
> 微信通道可能把 `channel` 覆盖成 `wechat`，那次推送就不计入 DB 的 unipush 计数。

### 6.7 历史：点击带 payload 的探索结论（已放弃）

2026-10-30 在 Redmi 22041216UC 上实测，**点通知栏后 App 端始终没拿到 payload**：

| 形态 | 消息体 | 结果 |
|------|--------|------|
| `click_type=intent` | `intent` 里带 `S.payload`（裸 JSON） | 点击后 App 无跳转 |
| `click_type=intent` | `intent` 里带 `S.payload`（URL 编码） | 同上 |
| `click_type=payload` | `notification.payload` 字段 | 同上 |
| `click_type=both` | 两者都带 | 同上 |

判断依据：点击后**后端没有出现 `/api/v1/events/1537` 请求**（App 正常情况下跳详情页必发该请求），
且 `dumpsys activity activities` 里 Activity 的 intent 是
`act=MAIN cat=[LAUNCHER]` 而非我们给的 `intent://io.dcloud.unipush/...`。

**关键异常**：把 App 杀掉后再点通知栏，**App 进程根本没被拉起**（`pidof` 为空），
⇒ 通知的 `contentIntent` 很可能不可用（厂商/个推侧把我们给的 intent 丢了或解析失败）。

**已排除的干扰项**：

- 不是 App 端解析问题：`parsePushPayload()` 同时兼容「对象」与「JSON 字符串」两种形态。
- 不是「等太久」：点击后 5–10 秒内后端无任何请求。
- 不是在线/离线差异：在线个推通道与离线厂商通道两种都失败。
- ⚠️ **不能用 `adb shell am start -d 'intent://...'` 验证 payload**：
  `am` 只把该 URI 当作 `data`（走 `Uri.parse`），**不会做 `Intent.parseUri`**，
  extras 根本不会解析；且 `am start -d` 对 `intent://` 一律 `unable to resolve`。
  要验证只能**真点通知栏**。

**下一步（需要真机 + 可能需要重打包）**：

1. ~~复测补齐 `package=` 与 payload 编码后的 intent，确认冷启动点击能否拉起 App（`pidof` 非空）。~~
   → **已放弃**：改用 `click_type=startapp`（见 §6.6），不依赖 intent。
2. ~~厂商通道不透传 intent，改走 DCloud 官方组合 `transmission` + `force_notification`。~~
   → **已放弃**：`transmission` 形态下 App 进程被杀时无法自建通知栏。
3. 若将来仍要「点通知精确跳内页」：需要 DCloud 官方澄清 uni-push 2.0 客户端
   在厂商通道点击时的 payload 取值口径（或换用 `transmission` + `force_notification`
   并接受「App 存活时才有效」的代价）。

### 6.8 已知限制与排查要点

- **回执接口无权限**：`getReport` / `getReportDetailByTaskid` 返回
  `errCode 30017 permission denied of querying real_time_report`，拿不到逐台通道明细。
  只能用「设备侧证据」判断送达（`dumpsys notification` + `pidof` + 厂商 logcat 流量）。
- **`adb shell am start -d 'intent://...'` 验证不了 payload**：`am` 用 `Uri.parse` 而非
  `Intent.parseUri`，**extras 根本不会解析**。要验证 payload 必须真点通知栏，
  或让小米原样透传 intent（厂商通道）。
- **不要用扩展库回退**：扩展库路径不建通知栏，回退了业务侧会以为推成功。
  云函数默认直连失败即失败，扩展库回退需显式开 `UNIPUSH_LEGACY_FALLBACK=1`。
- **调试入口必须用独立密钥**：`UNIPUSH_DEBUG_SECRET`，**不得**回退到生产的 `UNIPUSH_SECRET`。
- **Android 与 iOS 的点击行为不同**：Android 用 `push_channel.android.ups.notification`，
  `click_type=startapp` 只开 App；iOS 走 `push_channel.ios`（APNs），仍带 `payload`，
  点通知会带 payload 触发 App 内跳转。同一套 Go 下发两端表现不同，**这是预期的**。
- **每日限流默认关闭**（`UNIPUSH_DAILY_LIMIT` 默认 0 = 不限，2026-11-10 起）：
  限流按用户计数，用户当天收到过 N 条后**所有**后续订阅更新（包括他最关心的
  偶像改期）都会被静默丢弃，表现为「站内通知有、通知栏没有」，
  极易被误判成通道故障。需要限流时用环境变量显式开启，那时：
  - **只算「成功下发」**：统计口径是 `notifications` 表里
    `channel=unipush 且 push_status=sent 且 delivered_at >= 当日零点` 的行数。
    统计失败**不阻断下发**（宁可多推一条，也不因为计数故障把推送全停）。
    同一条通知若被微信通道覆盖了 `channel`（多通道合并时按 `sent > failed > skipped` 取优先级），
    该次推送不计入限流 —— 属可接受偏差，不影响站内通知落库。

---

## 7. 常见问题

| 现象 | 排查方向 |
|------|----------|
| 库里没有该设备 | 装的包不含 Push 模块；或未登录；或 DCloud 未开通推送服务 |
| 厂商通道不生效 | DCloud 后台未填该厂商凭据；厂商侧包名/证书指纹不匹配 |
| App 在前台收不到系统通知 | **预期行为**：前台刻意不弹通知，只刷新角标与列表（见 `usePush.ts` 注释）。**但角标/列表应刷新** —— 若连 `/notifications` 请求都没有，才是真没收到 |
| 被杀后收不到 | 厂商通道未配置；或设备关闭了「后台弹出通知」；或用的是标准基座；或厂商 token 上报失败（见下） |
| 通知点击不跳转 | **预期行为**：已定稿 `click_type=startapp` —— 点通知**只打开 App**，跳转由 App 内部通知中心承接（见 §6.6） |
| 想让点通知跳到某个活动详情 | 需要改回 `intent`/`payload` 形态并解决厂商透传问题（§6.7，已放弃）；或点通知后 App 自己跳通知中心 |
| App 收到推送但没收到「今天第 3 条」 | **已不适用**（2026-11-10 起默认不限流）。若环境里显式设了 `UNIPUSH_DAILY_LIMIT`，超限记 `skipped` + `daily_push_limit_reached(N)`；站内通知始终全量落库 |
| 云函数返回「非法访问」 | 签名串里 `clientids` 写成了数组；必须是逗号连接后的字符串 |
| **云函数 `errCode:0` 但设备零反应** | `errCode:0` **只代表任务入队**。判断送达必须看设备侧证据（见下两行） |
| **回执 `successed_offline` 但设备没通知** | **不是失败**：厂商通道有分钟级聚合延迟（实测 ~11 分钟），见 §6.3。等 10 分钟以上再判定 |
| **通知栏出现但点不开/不跳转** | 通知栏记录若 `channel=Default` + 有 `deleteIntent=startService` ⇒ 厂商通道送达，intent 由小米原样透传；此时若不跳转，看 payload 是否落在 `S.payload`（见 §6.2） |
| **App 前台有 `/notifications` 请求、后台被杀后零流量** | 在线通道通、离线通道不通 → **厂商 token 上报失败**，查 `GySDK checkRegister` 日志 |
| logcat 刷 `GySDK checkRegister failed -20102` | **不是 1.0 噪音**，是 2.0 链路的注册失败（`gyuid` 带 `gtc_` 前缀 = 2.0 的 cid）。含义：**appid / 包名 / 签名指纹与 DCloud 登记的对不上** → 按 §3 核对指纹 |
| **解包 APK 后「找不到」某个类** | dex 字符串池每条前有 ULEB128 **长度前缀字节**，正则扫字符串会误判「不存在」。用 `dexdump` 或先剥前缀字节。`assets/39285EFA.dex` 是**加壳加密**的，运行时才解密 |
| `getPushClientId` 返回 cid 但 `onPushMessage` 不存在 | 包里不是 2.0 形态；`usePush.ts` 会打 `[push] uni.onPushMessage 不存在` 告警 |

> ⚠️ **云打包 release 包没有 console 输出**（logcat 里 `console` 行为 0），
> 所以 `[push] onPushMessage` 这类前端日志**看不到**。判断前台是否收到推送，
> 用 HTTP 副作用：`GET /api/v1/notifications/unread` 出现 = 收到了。
> 注意 `fetchUnreadCount` 只在首页 `onMounted` 与登录态变化时调用，**没有定时轮询**，
> 所以这个信号是干净的（详见 `docs/device-push-test.md` §5.7 的 A/B 对照实验）。

---

## 8. 隐私合规（已随 v1.1.0 完成）

接入厂商通道后，以下内容已在《隐私政策》v1.1.0 中披露，**改动采集行为必须同步改协议并递增版本**：

- 收集信息第 8 项：推送通道标识 + 厂商 SDK 可能读取的设备标识
- 权限申请清单：厂商 SDK 声明的权限；明确**本应用不主动申请 READ_PHONE_STATE**
- 第六节「第三方服务与 SDK 清单」：个推 / 华为 HMS Push / 小米 MiPush / 个验 /
  移动安全联盟 OAID / uni-app 基础运行时，逐个列包名、用途、权限、涉及个人信息、隐私政策链接
- 6.3「与授权合作伙伴共享」：每日互动、华为、小米三个接收方及共享范围
- 用户协议 v1.1.0 新增「二、消息推送服务」

协议正文与后端 `GET /api/v1/public/agreements` 必须同源：
改完执行 `npm run export:agreements`（写入 `../idoltrail-server-main/internal/agreements/content.json`）。
