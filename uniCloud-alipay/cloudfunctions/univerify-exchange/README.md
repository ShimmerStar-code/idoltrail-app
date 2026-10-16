# univerify-exchange 部署说明

本目录是 **uniCloud 云函数源码的归档副本**，运行时版本在 App 工程里：

```
idoltrail-app/uniCloud-alipay/cloudfunctions/univerify-exchange/
```

两处内容必须一致（改任一侧都要同步另一侧）。归档在服务端仓库，
是因为取号凭证的信任边界在服务端 —— 云函数源码属于后端配置的一部分。

> 代码**不要**提交任何真实密钥：appid / secret 都走 uniCloud 控制台的环境变量。

## 一、上传

1. 在 HBuilderX 里打开已经关联了 uniCloud 服务空间的 **App 工程**
   （`idoltrail-app`，因为只有 App 端需要一键登录）。
   如果工程尚未关联：右键 `uniCloud-alipay` 目录 → 关联云服务空间 → 选择已有空间。
2. 确认 `idoltrail-app/uniCloud-alipay/cloudfunctions/univerify-exchange/` 下
   已存在 `index.js` / `package.json` / `config.json`。
3. HBuilderX 右键该目录 → **上传部署**（云端安装依赖）。

> ⚠️ `package.json` 里的 `extensions.uni-cloud-verify` **不能删**。
> 自 HBuilderX 3.4.0 起，未声明该扩展库的云函数无法调用 `uniCloud.getPhoneNumber`，
> 上传后取号会直接报接口不存在。这是官方硬性要求。

## 二、配置环境变量

uniCloud 控制台 → 云函数 → `univerify-exchange` → 函数配置 → 环境变量：

| 变量 | 值 | 说明 |
| --- | --- | --- |
| `UNIVERIFY_APPID` | `__UNI__F1F9279` | 必须与 `idoltrail-app/src/manifest.json` 的 `appid` 完全一致 |
| `UNIVERIFY_SECRET` | 32 字节以上随机串 | 必须与 Go 侧 `UNIVERIFY_SECRET` 一致 |

生成随机串：

```bash
openssl rand -hex 32
```

## 三、URL 化（关键）

`config.json` 里已写死 `path: "/idoltrail/univerify-exchange"`，
URL 化地址即由它拼出：

```
https://<服务空间默认域名>/idoltrail/univerify-exchange
```

> 改了 `path` 必须同步改 Go 侧的 `UNIVERIFY_FUNC_URL`，否则取号链路直接 404。
> 也可以在 uniCloud 控制台 → 云函数 → `univerify-exchange` → URL 化 里复制实际地址核对。

填入 Go 后端 `.env`：

```bash
UNIVERIFY_ENABLED=true
UNIVERIFY_APPID=__UNI__F1F9279
UNIVERIFY_FUNC_URL=<上一步复制的 URL>
UNIVERIFY_SECRET=<与云函数一致>
UNIVERIFY_IP_HOURLY_LIMIT=20
```

## 四、自检

```bash
# 用任意假 token 调一次，能返回 {"code":-1,...,"message":"非法访问"}
# 说明 HMAC 校验已生效（而不是直接 500 或泄露取号能力）
curl -X POST "$UNIVERIFY_FUNC_URL" \
  -H 'Content-Type: application/json' \
  -d '{"access_token":"x","openid":"y","sign":"bad"}'
```

## 五、真机验证前置条件

一键登录走运营商网关，**必须满足**：

- Android / iOS 真机 + 已开通的一键登录服务（DCloud 后台已为该 AppID 开通）
- 插入有 SIM 卡的设备，且**使用移动数据**（Wi-Fi 下取不到本机号码）
- App 使用**包含 OAuth/一键登录模块的自定义基座或云打包**安装，普通基座跑不了

## 六、签名一致性

`index.js` 的 `signParams` 与 `idoltrail-server-main/internal/service/univerify.go`
的 `signParams` 是同一套算法：**参数按 key 升序拼 `k=v&k=v`，HMAC-SHA256，输出小写 hex**。
改任何一侧都必须同步改另一侧，否则登录会一直报「非法访问」。
