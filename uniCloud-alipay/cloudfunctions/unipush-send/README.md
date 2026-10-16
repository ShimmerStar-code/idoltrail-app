# unipush-send

uni-push 2.0 消息下发中转。URL 化后供 `idoltrail-server-main` 的
`internal/pkg/push/unipush.go` 调用。

## 为什么需要这个云函数

uni-push 2.0 官方文档只提供 `uni-cloud-push` 扩展库的服务端能力，并明确
「开发者无需关心证书、签名、服务器端文档」。自建 Go 服务没有对应的对外
HTTP 推送端点，只能经本函数中转。

## 部署步骤

1. HBuilderX 右键本目录 → **上传部署**（首次会提示创建同名云函数）。
2. 云端配置环境变量（控制台 → 云函数 → `unipush-send` → 配置 → 环境变量）：

   | 变量 | 必填 | 说明 |
   | --- | --- | --- |
   | `UNIPUSH_APPID` | 是 | DCloud AppID，如 `__UNI__F1F9279` |
   | `UNIPUSH_SECRET` | 是 | 与 Go 侧 `UNIPUSH_SECRET` 一致，建议 ≥32 字节随机串 |

3. 本目录 `config.json` 已写死 `path: "/idoltrail/unipush-send"`，
   右键本目录 → **创建 URL 化服务** 后地址即由它拼出：

   ```
   https://<服务空间默认域名>/idoltrail/unipush-send
   ```

   把该地址填到服务器 `.env` 的 `UNIPUSH_CLOUD_URL`。
   > 改了 `path` 必须同步改 `UNIPUSH_CLOUD_URL`，否则推送静默失败。
   > URL 化地址属于敏感信息，不要提交到仓库或贴进聊天记录。

## 依赖的 opendb 表

`uni-cloud-push` 扩展库依赖 `opendb-tempdata`、`opendb-device`、
`uni-id-device`。服务空间为正式版时需自行确认这三张表存在（uni-id-device
仅在基于 uni-id 推送时才用，本项目按 `push_clientid` 推送，不依赖它）。

## 与 univerify-exchange 的关系

两者结构完全同构（HMAC-SHA256 验签 + `pickEvent` 网关兼容 + 裸 JSON 返回），
共用同一套签名约定，可对照阅读。

## 官方限制与本函数的处理

| 限制 | 本函数行为 |
| --- | --- |
| 单次 `sendMessage` 最多 500 台 | 按 500 一批自动拆分，逐批下发并汇总 |
| `title` < 20 字符 | 按码点截断（不截 emoji），记 warning |
| `content` < 50 字符 | 同上 |
| `payload` < 800 字符且须为对象 | 超限时从后往前丢字段直到合法，记 warning |
| `payload` 必须是对象 | 云函数内强制转对象，保证离线厂商通道能透传 |

超时设为 30s 而非默认 15s：单次调用最坏情况是 1000 台 cid 拆 2 批串行下发。
