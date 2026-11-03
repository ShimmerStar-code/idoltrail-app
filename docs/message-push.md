# 消息推送逻辑

> 适用范围：App 端（`idoltrail-app`）+ Go 后端（`../idoltrail-server-main`）。
> 站内消息（消息中心）与系统推送（uni-push）**共用一张 `notifications` 表**，但口径与限流完全不同，
> 这份文档把两者的边界写清楚，避免再出现「一条运营批量操作给用户刷 1000 条」的事故。

## 一、两条链路，别混

| 链路 | 落库 | 谁能看到 | 数量上限 |
|------|------|---------|---------|
| **站内消息**（消息中心 / 铃铛面板） | `notifications` | 只有本人（读取端全部按 `user_id` 过滤） | **不限** |
| **系统推送**（uni-push 通知栏） | 同一条记录 + `channel='unipush'` | 本人设备 | **每用户每天 2 条** |

- 「每天 2 条」只约束**系统推送**，站内消息不限制。
  实现见 `internal/service/push_quota.go`（按 `user_id + 自然日` 计数，`channel='unipush'` 才占额度）。
  ⚠️ 该实现**尚未部署**到线上。
- 站内消息是**唯一权威历史**，系统推送只是它的外发投影；外发失败（`push_status='failed'`）
  不影响站内消息存在。

## 二、后端分发路径（三条）

活动/城市/艺人变更后，`internal/service/notification.go` 有三个 Dispatch 入口：

| 入口 | 触发者 | 目标人群 |
|------|--------|---------|
| `DispatchEventChange` | 改了某个活动（时间/场地/信息/艺人） | **订阅了该活动**的用户 |
| `DispatchCityChange` | 同上（城市订阅是批量订阅） | **订阅了该城市**的用户 |
| `DispatchArtistRelatedEvents` | 艺人相关变更 | **订阅了该艺人**的用户 |

运营后台的入口统一走 `internal/handler/admin_event.go` 的 `dispatchToEventAndCity`，
它同时分发到「活动订阅者」和「城市订阅者」，两条路径**共享同一份 `Notified` map**（同一用户不重复收）。

### 当前口径（2026-10-30 起）

| 订阅类型 | 收到哪些通知 |
|---------|-------------|
| 活动订阅 | 该活动的**全部**变更：`new_event` / `time_change` / `venue_change` / `artist_change` / `info_change` / `event_cancel` |
| 城市订阅 | **只有** `new_event`（新活动上线）和 `event_cancel`（活动取消） |
| 艺人订阅 | 该艺人的相关变更 |

**为什么城市订阅要收窄**：城市订阅是批量订阅（订了北京 = 订阅北京全部活动），
运营每改一次时间/场地，就等于给每个城市订阅者发一条，数量与用户「我关心什么」完全脱钩。
2026-10-29 一次运营批量导入在库里留下 **4810 条**通知，4 个只订了北京的用户各收 1000+ 条，
App 铃铛角标顶到 99+。变更类通知改为**活动订阅者专享**，城市订阅者只留强信号。

### 未发布活动不发通知

`dispatchToEventAndCity` 现在统一校验活动 `status == PUBLISHED` 才落库，
**`event_cancel` 豁免**（取消时 status 已被改成 CANCELLED，恰恰是最该通知的时刻）。
之前 DRAFT 活动也照发，2026-10-29 那批里有 663 条（64%）指向从未公开的活动。

### 排序兜底

`ListByUserID` 排序 `created_at DESC, id DESC`。只按 `created_at` 排序时，
同一秒写入的多条记录顺序不稳定（MySQL 对并列行的返回顺序不保证），
表现为「刷新后列表里同一条消息跳来跳去」。加 `id DESC` 做稳定兜底。

## 三、站内消息的语义（2026-10-30 修正）

| 操作 | 接口 | 语义 |
|------|------|------|
| 未读数 | `GET /notifications/unread-count` | 统计**全部** `is_read = 0` |
| 全部已读 | `POST /notifications/read-all` | 置 `is_read = true`，返回受影响行数 |
| 单条已读 | `POST /notifications/:id/read` | 置 `is_read = true` |
| 清空已读 | `DELETE /notifications/read` | 只删 `is_read = true` 的 |
| 清空全部 | `DELETE /notifications` | **删掉该用户全部消息（含未读）**，返回 `{ok, deleted}` |

**为什么加了「清空全部」**：老 UI 上的按钮是「清空已读」，只删已读记录；
但角标统计的是全部未读 → 点完「清空已读」角标纹丝不动，用户以为功能坏了
（2026-10-30 反馈：「我清空了，下次打开还有」）。
现在 App 端 UI 一律走「清空全部消息」（含未读），并且：
- App 侧乐观清空（列表 + 角标同时归零），失败整体回滚；
- 破坏性操作先弹确认。

### 「全部已读」为什么从来没生效过

生产库 4810 条通知的 `is_read` **全部为 0** —— 说明这个接口在生产上从未成功改写过任何一行。
路由、前端调用、repo 的 `Where("user_id = ? AND is_read = false").Update("is_read", true)` 都看着是对的，
所以在 `MarkAllRead` 里加了 **RowsAffected 日志**（`notification mark-all-read`，带 `uid`/`rows`），
部署后观察一次即可定位（0 行 = 没查到 / 行数异常 = 写到了别的表）。

## 四、App 端

| 位置 | 文件 | 说明 |
|------|------|------|
| 铃铛面板（首页） | `src/components/NotificationPanel/index.vue` | 拉最近 20 条；「全部已读」+「清空全部」 |
| 消息中心 | `src/pages/profile/messages.vue` | 全量列表 + 分页 + 下拉刷新 + 「清空全部」 |
| 个人中心入口 | `src/pages/profile/index.vue` | 一级菜单「消息中心」+「推送设置」 |
| 状态 | `src/stores/notification.ts` | `list`（消息中心）与 `panelList`（面板）**分开**，互不冲掉 |

**刷新策略（这次修的核心）**：`refreshAfterPush` 只刷角标、不刷 `list`
（怕把用户翻到的页码重置）。副作用是「App 存活期间收到离线推送，消息中心列表却不会更新」。
现在用 `hasStaleUnread` 兜底：

```
hasStaleUnread = 角标未读数 > 已加载列表里的未读数
```

角标是服务端全量未读数，列表只是已加载的部分 → 差值 > 0 一定意味着「有还没进列表的消息」，
页面 `onShow` 发现它为真就重拉第 1 页；差值 ≤ 0 则不重拉（避免打断用户翻页）。
另外消息中心支持下拉刷新。

## 五、历史数据清理记录

- 2026-11-03：清空生产 v2 库（`idoltrail-mysql2` / 库 `idoltrail`）的 `notifications` 表，
  清理前 4838 条 → 清理后 0 条。
- 备份：`C:\Users\trunk\AppData\Local\Temp\uni-agent\backup\notifications-20261103-140055.sql`
  （1,416,256 字节，dump 元组数与 `COUNT(*)` 三方一致才执行删除）。
- ⚠️ **清空只是止血**：城市订阅收窄 + DRAFT 不发通知的修复未部署前，
  运营再做批量操作仍会重新堆积（4838 就是这么来的）。

## 六、发布顺序（重要）

App 端「清空全部消息」依赖后端新接口 `DELETE /notifications`。
**后端未部署时**，App 点「清空全部」会失败 → store 回滚 + 提示「清空失败，请重试」（数据不会丢）。

因此：
1. 后端（Go）先发：`release-v2.yml` 只重建 `api2` 容器；
2. App 端随下一次打包发版（含一键登录修复等其他待发内容）；
3. 后端接口没上之前，App 端的「清空全部」按钮建议先隐藏或保持现状。
