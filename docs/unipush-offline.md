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
| 厂商通道占位声明（`mi` / `hms`） | ✅ 已配 | 同上，`unipush.mi` / `unipush.hms` |
| App 模块勾选 Push | ✅ 已勾 | `src/manifest.json` → `app-plus.modules.Push` |
| 客户端取 cid 并上报后端 | ✅ 已实现 | `src/composables/usePush.ts` → `syncPushToken()` |
| 后端推送通道开关 | ✅ 已开 | 正式 v2：`.env.prod` 的 `UNIPUSH_ENABLED=true` 等 5 项 |
| 云函数 `unipush-send` 中转 | ✅ 已通 | `uniCloud-alipay/cloudfunctions/unipush-send/index.js` |
| **DCloud 后台离线推送配置（小米/华为凭据）** | ⬜ 待配 | DCloud 开发者中心 → uni-push → 离线推送 |
| **厂商平台侧开通（AppID / 证书 / 包名绑定）** | ⬜ 待办 | 小米开放平台、华为 AppGallery Connect |
| **重新云打包** | ⬜ 待办 | HBuilderX 发行 → 云打包（需含 Push 模块） |
| 隐私政策披露 | ✅ 已补 | 《隐私政策》v1.1.0「六、第三方服务与 SDK 清单」 |

> ⚠️ 离线通道**必须用含 Push 模块的自定义基座或云打包包**安装，标准 HBuilder 运行基座
> 不含厂商通道，推送会静默失败。

> ⚠️ **在线（长连接）通道同样没打通**：2026-10-29 真机实测，云函数下发返回
> `errCode:0` 但设备**收不到任何系统通知**（2.0 长连接服务 `CustomGTService`
> 启动后被系统 idle 停掉且不重建）。**根因已定性：打出来的包里没有 uni-push 2.0**
> ——APK 的 `dcloud_properties.xml` 注入的是 1.0 的 `GTPushService`，dex 里只有
> `com.getui.gtc.*` / `com.igexin.*`，`dcloud_control.xml` 无 push 节点，
> `supplierconfig.json` 的 xiaomi / huawei / oppo 全空。
> `errCode:0` 只代表任务入队、不代表送达。
> 完整证据链与操作方法见 **[`docs/device-push-test.md`](./device-push-test.md)**。

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
          "hms": {}            // ★ 华为通道占位，缺失则华为机型收不到
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

路径：**DCloud 开发者中心 → 应用 __UNI__F1F9279 → uni-push → 离线推送**

| 厂商 | 需要填写 | 备注 |
|------|----------|------|
| 小米 MiPush | 小米开放平台的 AppID、App 包名、推送证书 | 证书需用**云打包签名证书**上传到小米 |
| 华为 HMS Push | 华为 AppID（AGConnect Connect API Key）、App 包名、证书 SHA1 | 需先在 AppGallery Connect 创建应用并关联包名 |

未配置的厂商，对应品牌设备**收不到系统通知**（会静默降级为在线通道，App 在前台才有）。

---

## 4. 待办二：厂商平台侧开通

### 4.1 小米

1. 小米开放平台（<https://dev.mi.com>）注册应用，拿到 **AppID**。
2. 开通「消息推送（MiPush）」服务，上传**云打包用的签名证书**（小米要求校验签名，
   证书必须与最终发版包一致；用 DCloud 公共证书则需在小米后台登记该证书指纹）。
3. 在 DCloud 后台把 AppID 回填。

### 4.2 华为

1. AppGallery Connect（<https://developer.huawei.com/consumer/cn/service/josp/agconnect/index.html>）
   创建应用，登记 Android 包名 `com.idoltrail.app` 与**证书 SHA1**。
2. 开通「推送服务（Push Kit）」，拿到 **App ID** 与 **Connect API Key**。
3. 在 DCloud 后台回填。

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

4. 让运营在后台改一次活动时间/场地，观察：
   - App 在后台 → 锁屏 → 收到系统通知（走厂商通道）
   - App 在前台 → 不弹系统通知（产品刻意设计：只刷新角标与列表），日志里可见
     `[push] onPushMessage receive`

---

## 6. 常见问题

| 现象 | 排查方向 |
|------|----------|
| 库里没有该设备 | 装的包不含 Push 模块；或未登录；或 DCloud 未开通推送服务 |
| 厂商通道不生效 | DCloud 后台未填该厂商凭据；厂商侧包名/证书指纹不匹配 |
| App 在前台收不到系统通知 | **预期行为**：前台刻意不弹通知，只刷新角标与列表（见 `usePush.ts` 注释） |
| 被杀后收不到 | 厂商通道未配置；或设备关闭了「后台弹出通知」；或用的是标准基座 |
| 通知点击不跳转 | `payload` 缺 `relatedType`/`relatedId`/`url`，见 `resolvePushUrl()` |
| 云函数返回「非法访问」 | 签名串里 `clientids` 写成了数组；必须是逗号连接后的字符串 |
| **云函数 `errCode:0` 但设备零反应** | **不是**送达成功。看 logcat 有没有 uni-push **2.0** 的连接建立日志；没有就是长连接没建起来 → **解包 APK 看 `assets/data/dcloud_properties.xml`**：注入的是 `GTPushService`（1.0）就是**包里没有 2.0** → 配厂商通道后**重新云打包** |
| logcat 刷 `GySDK checkRegister failed -20102` | uni-push **1.0** 通道的噪音（该 AppID 没开 Getui 1.0）。**但它同时说明这个包只注入了 1.0**，别当无关噪音放过 |
| `getPushClientId` 返回 cid 但 `onPushMessage` 不存在 | 包里不是 2.0 形态；`usePush.ts` 会打 `[push] uni.onPushMessage 不存在` 告警 |

---

## 7. 隐私合规（已随 v1.1.0 完成）

接入厂商通道后，以下内容已在《隐私政策》v1.1.0 中披露，**改动采集行为必须同步改协议并递增版本**：

- 收集信息第 8 项：推送通道标识 + 厂商 SDK 可能读取的设备标识
- 权限申请清单：厂商 SDK 声明的权限；明确**本应用不主动申请 READ_PHONE_STATE**
- 第六节「第三方服务与 SDK 清单」：个推 / 华为 HMS Push / 小米 MiPush / 个验 /
  移动安全联盟 OAID / uni-app 基础运行时，逐个列包名、用途、权限、涉及个人信息、隐私政策链接
- 6.3「与授权合作伙伴共享」：每日互动、华为、小米三个接收方及共享范围
- 用户协议 v1.1.0 新增「二、消息推送服务」

协议正文与后端 `GET /api/v1/public/agreements` 必须同源：
改完执行 `npm run export:agreements`（写入 `../idoltrail-server-main/internal/agreements/content.json`）。
