# Mobilerun 真机测试指南（本地 Android 设备）

> 目的：把「改完代码 → 推到真机 → 点一遍 → 和服务端对上账」这条链路固定下来，
> 以后每个功能做完都能按同一套步骤复验，不用每次重新摸索。
>
> 配套阅读：本文档只讲**怎么测**；业务逻辑看 `CLAUDE.md`，推送专项看
> `docs/device-push-test.md`，商店合规看 `docs/app-store-review.md`。

---

## 0. 先分清两个「mobilerun」

| | 本地 CLI（本文档讲这个） | 仓库内 `scripts/mobilerun/` |
|---|---|---|
| 形态 | 独立可执行文件 `C:\Users\trunk\.local\bin\mobilerun.exe`（Python/uv 装） | Node 脚本，走 `@mobilerun/sdk` |
| 设备 | **本机 USB 连着的 Android 真机**（adb） | **Mobilerun 云真机**（要 `MOBILERUN_CLOUD_API_KEY`） |
| 驱动方式 | LLM agent 按自然语言操作 + 确定性 `device` 命令 | 固定脚本（写死步骤） |
| 本机状态 | ✅ 已装好并配好 | ⚠️ 未配 key（`whoami` 报 Not logged in） |

**日常开发用本地 CLI 那一套**：设备就在手边、能连测试服、能看 logcat、不花钱。
云真机那套留给「要 iOS / 要多机型 / 要在别人机器上复现」的场景。

---

## 1. 本机环境实况（已配置好的部分）

### 1.1 可执行文件与版本

```powershell
C:\Users\trunk\.local\bin\mobilerun.exe --version    # v0.7.4
```

Python 运行环境在 `C:\Users\trunk\AppData\Roaming\uv\tools\mobilerun\`（uv 管理）。
该目录**不在系统 PATH 里**，所以要用全路径调用，或把
`C:\Users\trunk\.local\bin` 加进 PATH。

### 1.2 配置文件位置与关键字段

`C:\Users\trunk\AppData\Local\droidrun\droidrun\config.yaml`

```yaml
agent:
  max_steps: 15          # 不传 --steps 时的默认步数
  reasoning: false
  streaming: true
llm_profiles:
  manager / executor / fast_agent / app_opener / structured_output:
    provider: OpenAILike
    model: MiniMax-M3
    base_url: https://api.minimaxi.com/v1
    api_key_source: file
device:
  serial: null           # null = 自动选唯一一台
  platform: android
  auto_setup: true
logging:
  save_trajectory: none  # 想留轨迹改 step，落在 trajectories/
```

改配置用 `mobilerun configure`（交互式向导），别手改 yaml 的凭据段。

### 1.3 设备

| 项 | 值 |
|---|---|
| serial | `HMEUPN8XLJT8XWXS`（adb 自动识别，`device.serial: null` 时取唯一那台） |
| 系统 | Android 14 |
| 机型 | 22041216UC |
| 分辨率 | 1080 × 2460，density 440 |
| 设备上装了两个包 | `io.dcloud.HBuilder`（标准基座，跑 HBuilderX「运行到手机」的调试包）<br>`com.idoltrail.app`（自建包，正式/云打包产物） |

> 测**开发中的代码**用 `io.dcloud.HBuilder`；测**上架版本**用 `com.idoltrail.app`。

### 1.4 ADB 不在 PATH 里

`mobilerun doctor` 会报 `adb not found in PATH`，但**不影响使用**——HBuilderX 自带 adb：

```powershell
$adb = "C:\Users\trunk\Downloads\HBuilder\HBuilderX\plugins\launcher-tools\tools\adbs\adb.exe"
& $adb devices
```

### 1.5 控制台编码（必看）

Windows 中文控制台是 GBK，mobilerun 打印 `•` / emoji 会直接
`UnicodeEncodeError: 'gbk' codec can't encode character '\u2022'` **崩掉**。

**所有 mobilerun 命令前都要加 UTF-8 环境变量**：

```powershell
$env:PYTHONUTF8="1"; $env:PYTHONIOENCODING="utf-8"
```

或者 `chcp 65001`。注意即使加了，PowerShell 里看到的中文**仍可能花屏**（终端码页问题），
但那只是显示问题，**不影响工具本身读到的内容**（agent 看到的 UI 树是正确的）。

---

## 2. 命令速查

### 2.1 自然语言走查（LLM agent 驱动设备）

```powershell
$env:PYTHONUTF8="1"; $env:PYTHONIOENCODING="utf-8"
& "C:\Users\trunk\.local\bin\mobilerun.exe" run "你的任务描述" --steps 20
```

常用参数：

| 参数 | 用途 |
|---|---|
| `--steps N` | 最大步数（每步 = 一次 LLM 决策 + 一次设备动作） |
| `-d <serial>` | 指定设备（多台时必填） |
| `--vision` | 打开截图视觉（默认只用无障碍树，看不懂布局时开） |
| `--vision-only` | 只用截图，不用 UI 树 |
| `--stream / --no-stream` | 是否流式打印（关掉更清爽） |
| `--save-trajectory step` | 保存每步轨迹到 `trajectories/` |

**步数预算**：`--steps 100` 实测 10 步用了 ~4 分钟，100 步 ≈ 40 分钟。**别默认开 100**：
- 探索性走查（找 UX 问题）：`--steps 20~30`
- 已知路径的回归：`--steps 8~12`
- 精确断言：**别用 agent，用 §2.2 的确定性命令**

### 2.2 确定性设备命令（做断言用这个）

```powershell
$env:PYTHONUTF8="1"; $env:PYTHONIOENCODING="utf-8"
$exe = "C:\Users\trunk\.local\bin\mobilerun.exe"

& $exe devices                       # 列出本机设备
& $exe doctor                       # 健康检查
& $exe device ui                    # 打印无障碍树（带元素坐标）
& $exe device screenshot            # 截图，路径打到 stdout
& $exe device tap 571 317           # 点击
& $exe device swipe 540 1600 540 800
& $exe device type "周深"            # 输入（支持中文）
& $exe device press back             # 系统按键
& $exe device start io.dcloud.HBuilder
& $exe device apps                   # 已装应用
```

坐标从 `device ui` 的输出里抄：`22. TextView: "✕" - (929,288,1001,349)` → 中心点 ≈ (965,318)。

### 2.3 其余子命令

| 命令 | 说明 |
|---|---|
| `configure` | 配置 LLM provider / 模型 / 凭据 |
| `login` / `logout` / `whoami` | Mobilerun **云**账号（本地设备不需要） |
| `connect` / `disconnect` | 用 TCP 连远程设备 |
| `setup` | 在设备上安装 Mobilerun Portal |
| `ping` | 检查设备是否可达 |
| `macro` | 回放录好的自动化序列 |

---

## 3. 完整闭环：改代码 → 上机 → 验证

### 3.1 把最新代码推到设备

改完源码后必须重新推，否则测的是旧包：

```powershell
& "C:\Users\trunk\Downloads\HBuilder\HBuilderX\cli.exe" launch app-android `
  --project "C:\Users\trunk\Desktop\shimmer-star\idoltrail\idoltrail-app" --ui true
```

> HBuilderX ≥ 5.11 必须带 `--ui true`（不带会进 watch 模式卡住终端）。

### 3.2 确认「设备上跑的到底是哪份代码」

**这一步别跳过**——推失败/没推的时候，测半天的是旧代码，结论全错。

```powershell
$adb = "C:\Users\trunk\Downloads\HBuilder\HBuilderX\plugins\launcher-tools\tools\adbs\adb.exe"
& $adb shell "grep -c 'searchInputKey' /storage/emulated/0/Android/data/io.dcloud.HBuilder/apps/HBuilder/www/app-service.js"
```

- 返回 `0` → 设备上还是旧包，重新推 / 重启 App
- 返回 `1` → 新代码已到位
- 技巧：**挑一个这次刚改的、独一无二的标识**（变量名/类名/文案片段）来 grep

### 3.3 确认设备连的是哪个后端

```powershell
& $adb shell "grep -o -E 'https?://[a-zA-Z0-9.:/_-]*api[a-zA-Z0-9.:/_-]*' /storage/emulated/0/Android/data/io.dcloud.HBuilder/apps/HBuilder/www/app-service.js | sort -u"
```

实测输出（决定你能不能在服务端查到这次测试的数据）：

```
http://103.24.218.69:8081/api/v1     ← 测试服（.env.dev / .env.dev.local）
https://api.idoltrail.com/api/v1     ← 生产 v2 隔离栈（.env.prod）
```

要打测试服：改 `.env.dev.local` 的 `VITE_API_BASE_URL`，然后重走 §3.1。
**别靠记忆判断，用上面这条命令看。**

### 3.4 起 App + 唤醒设备

```powershell
& $adb shell svc power stayon true          # 关键：禁止自动息屏
& $adb shell input keyevent 224             # 唤醒
& $adb shell wm dismiss-keyguard            # 滑锁（非安全锁才有效）
& $adb shell am start -n io.dcloud.HBuilder/io.dcloud.PandoraEntry
Start-Sleep -Seconds 10
```

---

## 4. 各功能点的测试步骤（附服务端核对点）

前置约定：
- `$adb` / `$exe` 见 §1.4 / §2.2
- 设备已唤醒、App 已启动（§3.4）
- 服务端核对用测试服 `103.24.218.69`（**可写可改**）；
  `47.94.165.221` 是线上正式机，**只读**，只允许 `ls/cat/docker ps/curl` 这类只读探测

| # | 功能点 | 设备动作 | 断言（`device ui` 看得到什么） | 服务端核对 |
|---|---|---|---|---|
| 1 | 首屏 / feed | 打开 App，等 3s | 有「北京/全国/全球」区域行、活动卡片、底部 4 个 tab | `GET /events?status=PUBLISHED&order=date_ASC` 返回列表与页面一致 |
| 2 | 区域切换 | 点「全国」→「全球」 | feed 标题变成「全球 · 著名城市优先」 | 同上接口换 `scope=global` |
| 3 | 排序 | 点排序胶囊 → 选一项 | 胶囊文案变化、卡片顺序变化 | `order=date_ASC / created_DESC / hot` |
| 4 | 分类抽屉 | 点「分类」→ 选一个类型 | 跳到活动列表页且筛选生效 | `GET /events?type=CONCERT` |
| 5 | **搜索** | 点搜索框 → 输入「周深」 | 面板展开；结果里有「周深」；**点面板外的空白处面板应关闭、关键词应清空** | `GET /search/artists`、`/search/events`、`/search/places` |
| 6 | 搜索历史 | 搜一次 → 关掉 → 再点搜索框 | 「搜索历史」里有刚才的词；「清空」可清 | 无（本地 storage） |
| 7 | 活动详情 | 点一张卡片 | 标题/日期/城市/购票链接齐全 | `GET /events/{id}` |
| 8 | 点赞 | 点「喜欢」 | 计数 +1，图标变实心 | `POST /events/{id}/like` |
| 9 | 订阅（偶像/城市/活动） | 点「订阅」 | 按钮变「已订阅」/「退订」 | `POST/DELETE /subscriptions/{artists,cities,events}` |
| 10 | 登录（短信） | 我的 → 登录 → 输入手机号 → 收码 → 登录 | 进入已登录态，昵称/星币显示 | `POST /auth/sms/send`、`/auth/phone-login` |
| 11 | 一键登录 | 登录页勾选协议 | 有 SIM 卡 + 移动数据时自动弹授权页；否则整段静默不出现 | `POST /auth/onekey-login` |
| 12 | 我的资料 | 我的 → 编辑资料 → 改昵称 | 列表页昵称同步更新 | `PATCH /user/me` |
| 13 | 社交主页链接 | 我的 → 第三方主页 → 新增 | 列表出现链接 | `POST /user/social-links`、`GET /public/users/{id}/profile` |
| 14 | 贡献榜 | 首页「贡献榜」 | 榜单有数据、能进他人主页 | `GET /public/rankings` |
| 15 | 订阅-日程 tab | 订阅页 → 日程 | 日历格子有「N 场」角标 | `GET /subscriptions/events` |
| 16 | 加入系统日历 | 日程 → 某场「加入日历」 | 系统日历弹窗授权 | 本地（`utils/calendar.ts`） |
| 17 | 消息中心 | 我的 → 消息中心 | 列表/未读角标/清空全部可用 | `GET /notifications`、`DELETE /notifications` |
| 18 | 通知权限 | 首次订阅时 | 系统弹通知授权框 | `GET /notifications/settings` |
| 19 | 上传情报 | 首页/详情 → 上传情报 → 填表提交 | 提交成功提示，「我的投稿」能看到 | `POST /submissions`、`GET /submissions/mine` |
| 20 | 隐私/用户协议 | 登录弹窗里的协议链接 | 打开的是协议详情页，正文非空 | `GET /public/agreements` |
| 21 | 隐私同意（首次启动） | 清数据后启动 | 原生模板弹窗挡住 splash，点同意后才进 App | 无（本地 + 原生） |
| 22 | 捐赠 | 我的 → 捐赠 | 通道未开通时显示「通道未开通」且入口按开关隐藏 | `POST /donations`（当前后端未落地） |
| 23 | 埋点 | 任走几个页面 | 无感 | `POST /analytics/events` → admin 看板「数据埋点」 |
| 24 | 推送 | 订阅后杀掉 App，等推送 | 系统通知栏收到通知 | `POST /user/devices/push-token` + uniCloud 云函数下发（见 `docs/device-push-test.md`） |

### 4.1 断言技巧

`device ui` 输出的元素**只有一部分**会进无障碍树：

- ✅ 稳定可见：标题、TextView、Image 的 resourceId（`tab-event`、`subscribe_icon`）
- ⚠️ 不稳定：`scroll-view` 内部的内容**常常不出现**在树里
  → 断言要挑「树里稳定可见」的元素，别断言 scroll-view 里的内容
- 💡 更好用的间接断言：**用「某块 UI 消失了」表示状态变化**。
  例：搜索面板展开时「本地/全国/全球」区域行会被隐藏（`searchPanelOpen` 控制），
  所以「区域行是否还在」就是一个稳定的开/关信号。

---

## 5. 踩过的坑（血泪版）

### 5.1 设备息屏/锁屏 → 所有点击静默失效 ⚠️ 最坑

现象：脚本没报错、tap 也「执行成功」，但界面毫无反应。
排查：`adb shell dumpsys power | grep mWakefulness` → `Asleep` 就是它。

```powershell
& $adb shell svc power stayon true   # 测试期间务必先开
```

设备的图案锁 adb 绕不过（`wm dismiss-keyguard` 无效、`locksettings set-disabled true` 也会被
有凭据的设备拒绝），**必须保证测试期间屏幕是亮的**；真锁了就得手动解锁。

### 5.2 第一次 tap 只会激活 WebView

App 刚启动时第一次点击只让 WebView 拿到焦点，**第二次**点击才聚焦到 `<input>`。
所以「点搜索框没反应」往往是少点了一次。

### 5.3 设备上跑的是旧代码

`grep` 一下（§3.2）确认，别默认推成功了。

### 5.4 后台跑 agent 会被杀掉

用 `Start-Process` 后台起 `mobilerun run`，父进程退出时子进程会被一起带走，
表现为「日志写到第 11 步就没了」。要么前台跑 + 给足 timeout，要么后台跑完立刻检查
`Get-CimInstance Win32_Process | Where-Object Name -match "mobilerun"`。

### 5.5 PowerShell 杀进程要按 PID

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.Name -match "mobilerun|python" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

### 5.6 agent 报告的现象要复核

agent 只看得到无障碍树，会把「树里没暴露」当成「界面没渲染」。
本例中它报告「点 ✕ 后关键词还在、面板没关」——**结论方向是对的，但归因是错的**，
真因见 §6。**agent 报的 bug 要用确定性命令复现一遍再改代码。**

---

## 6. 本次实测记录：搜索面板「点空白关不掉」

2026-11-07 用本机真机 + mobilerun 复现并定位，两个叠加的缺陷：

### 缺陷 A：透明面板挡住了遮罩层的点击

搜索面板 `.search-mask`（z-index 99）是**透明**的，且铺满搜索框以下的整片区域，
而绑了 `closeSearch` 的暗色遮罩 `.search-backdrop` 在它下面（z-index 98）——
用户点的每一块「空白」其实都落在透明面板上，`closeSearch` 永远不触发。

修法：新增透明层 `.search-layer`（普通 `view`，最稳的事件落点）承接点击，
面板内容再包一层 `@click.stop` 让「点结果/热门词」仍算选中。

### 缺陷 B：关闭后输入框仍持有焦点 → focus 事件把面板顶回来

`closeSearch()` 里 `searchActive = false`，但那个 `<input>` 仍持有 DOM 焦点，
uni-app 重新渲染时**再抛一次 `focus`** → `searchActive` 被置回 `true` → 面板弹回来。
表现就是「点了 ✕ / 点了空白，搜索面板纹丝不动」，
**极易被误判成「点击事件根本没触发」**。

修法：`<input :key="searchInputKey">`，`closeSearch()` 里 `searchInputKey++`
——旧节点被移除（DOM 焦点随之丢失），新节点 `focus=false` 不会自聚焦。

### 教训

「点了没反应」有两种完全不同的成因（事件没触发 / 事件触发了但状态被顶回来），
**必须先做区分再改代码**。区分方法：换一个不会引发二次副作用的观测点
（例如「区域行是否还在」）来判断状态到底有没有变。

---

## 7. 一页速查

```powershell
# 环境
$env:PYTHONUTF8="1"; $env:PYTHONIOENCODING="utf-8"
$exe = "C:\Users\trunk\.local\bin\mobilerun.exe"
$adb = "C:\Users\trunk\Downloads\HBuilder\HBuilderX\plugins\launcher-tools\tools\adbs\adb.exe"

# 推代码 + 确认落地
& "C:\Users\trunk\Downloads\HBuilder\HBuilderX\cli.exe" launch app-android `
  --project "C:\Users\trunk\Desktop\shimmer-star\idoltrail\idoltrail-app" --ui true
& $adb shell "grep -c '<新标识>' /storage/emulated/0/Android/data/io.dcloud.HBuilder/apps/HBuilder/www/app-service.js"

# 唤醒 + 起 App
& $adb shell svc power stayon true
& $adb shell input keyevent 224
& $adb shell am start -n io.dcloud.HBuilder/io.dcloud.PandoraEntry

# 找元素坐标 → 点
& $exe device ui | Select-String "TextView"

# 走查（少步数）
& $exe run "检查首页与搜索的交互是否合理" --steps 12
```
