// Pinia store：通知状态管理（未读数 + 通知列表）
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { notificationApi } from '@/api/notification'
import {
  DEFAULT_NOTIFICATION_TYPES,
  type Notification,
  type NotificationSettings,
  type NotificationType,
  type NotificationTypeSettings,
} from '@/types/notification'
import { hasNotifPrompted } from '@/utils/storage'
import { ensureSystemPermission } from '@/utils/privacy'

/**
 * 消息页最多保留的条数上限。
 *
 * 消息页是「无限下拉翻页」的：每页 20 条，用户可以一直往下拉。
 * 数据量本身不大（一条通知几百字节），但没有上限时
 * 长时间挂着页面会把内存一点点吃满。上限 200 条 = 10 页，
 * 超过后丢弃最早的一页并提示用户回到顶部重新拉。
 */
const MAX_LIST_SIZE = 200

/** 面板（首页铃铛）最多展示条数 */
const MAX_PANEL_SIZE = 20

export const useNotificationStore = defineStore('notification', () => {
  // ── state ──
  /**
   * 消息页列表（分页累加）。
   *
   * ⚠️ 与 panelList 分开存，不能共用一个数组。
   * 早期两处共用 list，面板每次打开都 fetchList(1, 20) 把整个数组替换掉，
   * 消息页翻到第 3 页后只要开一次面板，页码与数据就错位了。
   */
  const list        = ref<Notification[]>([])
  /** 面板列表：永远是最新的 MAX_PANEL_SIZE 条，与消息页互不干扰 */
  const panelList   = ref<Notification[]>([])
  const total       = ref(0)
  /**
   * 服务端已返回的累计条数（与 list.length 解耦）。
   *
   * list 有 MAX_LIST_SIZE 上限，list.length 到顶后就不再增长；
   * 但「服务端还有多少没拉」必须由这个独立计数回答，
   * 否则 hasMore 会在到顶那一刻变成 false，用户再也没法加载剩下的消息。
   */
  const loadedCount = ref(0)
  const unreadCount = ref(0)
  const loading     = ref(false)
  const settings    = ref<NotificationSettings>({
    pushEnabled: true,
    pushTypes: { ...DEFAULT_NOTIFICATION_TYPES },
  })

  // ── 通知授权弹窗控制 ──
  const showNotifPrompt = ref(false)

  // ── getters ──
  const hasUnread = computed(() => unreadCount.value > 0)
  const badgeText = computed(() => {
    if (unreadCount.value <= 0) return ''
    return unreadCount.value > 99 ? '99+' : String(unreadCount.value)
  })
  const hasReadNotifications = computed(() => panelList.value.some(n => n.isRead))
  /**
   * 消息页是否还有下一页。
   *
   * 两个条件缺一不可：
   *   - 服务端还有没拉的（loadedCount < total）
   *   - 本地没到保留上限（list.length < MAX_LIST_SIZE）
   * 到上限后停止加载，列表长度保持稳定，滚动位置不会因为丢弃数据而跳动。
   */
  const hasMore = computed(
    () => loadedCount.value < total.value && list.value.length < MAX_LIST_SIZE,
  )

  // ── actions ──

  /**
   * 未读数 / 列表各自的请求序号。
   *
   * 与 stores/subscribe.ts 同一套防护：登出或切号时 reset() 会 ++ 计数器，
   * 让**登出前发出、登出后返回**的响应作废。否则 A 账号的未读数与通知列表
   * 会被写回 store，B 账号登录后直接看到 A 的消息与角标 —— 通知内容涉及用户
   * 订阅关系，串号比订阅串号更敏感。
   *
   * ⚠️ 未读数与列表必须各用一个计数器。refreshAfterPush() 用 Promise.all
   * 并发拉两者，共用单个序号会让其中一路恒被丢弃（角标不更新）。
   */
  let _unreadSeq = 0
  let _listSeq = 0
  let _panelSeq = 0

  /** 拉取未读数（首页 onMounted 时调用，轻量） */
  async function fetchUnreadCount() {
    const seq = ++_unreadSeq
    try {
      const res = await notificationApi.unreadCount()
      if (seq !== _unreadSeq) return
      unreadCount.value = res?.count ?? 0
    } catch {
      // 静默失败，不影响主流程
    }
  }

  /**
   * 拉取消息页列表（按页累加）。
   *
   * ⚠️ 早期实现里这里 push 完又 `slice(0, MAX_PANEL_SIZE)` 截断，
   * 而截断保留的是**最旧**的 50 条 —— 两个后果叠加成实质 bug：
   *   1) 第 51 条之后的消息刚 push 完就被丢掉，用户永远看不到；
   *   2) 消息页的翻页终止条件是 `list.length >= total`，
   *      list 被钉死在 50 而 total 常常远大于 50 → 条件恒为假 →
   *      下拉到底会**无限翻页**，每页 20 条请求发不完。
   * 现在：列表只增不减（到 MAX_LIST_SIZE 为止），并用独立的 loadedCount
   * 记录服务端已返回的累计条数，hasMore 不再依赖被截断后的长度。
   */
  async function fetchList(page = 1, page_size = 20) {
    const seq = ++_listSeq
    loading.value = true
    try {
      const res = await notificationApi.list(page, page_size)
      // 已有更新的请求发出 / 已登出 → 丢弃本次响应
      if (seq !== _listSeq) return
      // request 已拆包 data 字段，res 直接是 { list, total, page, page_size }
      const pageItems = res?.list ?? []
      if (page === 1) {
        list.value = pageItems
        loadedCount.value = pageItems.length
      } else {
        list.value.push(...pageItems)
        loadedCount.value += pageItems.length
      }
      total.value = res?.total ?? 0
      // 防御：单次响应异常大时截断（正常流程到 MAX_LIST_SIZE 就停，不会走到这）
      if (list.value.length > MAX_LIST_SIZE) {
        list.value = list.value.slice(-MAX_LIST_SIZE)
      }
    } catch (e) {
      console.error('[notification] fetchList failed', e)
    } finally {
      // 只有最新那次请求负责关闭 loading，避免旧请求提前把 loading 置 false
      if (seq === _listSeq) loading.value = false
    }
  }

  /**
   * 拉取面板（首页铃铛）的通知列表：永远只取最新一页。
   *
   * 与消息页数据完全隔离：面板打开/推送到达只动 panelList，
   * 不会把消息页已经翻到的位置和页码冲掉。
   */
  async function fetchPanelList(page_size = MAX_PANEL_SIZE) {
    const seq = ++_panelSeq
    try {
      const res = await notificationApi.list(1, page_size)
      if (seq !== _panelSeq) return
      panelList.value = res?.list ?? []
    } catch (e) {
      console.error('[notification] fetchPanelList failed', e)
    }
  }

  /**
   * 标记单条已读（消息页与面板两处列表都要同步）。
   *
   * ⚠️ 必须遍历**两个数组里的全部同 id 对象**再改，不能用 `??` 只改第一个：
   * list 与 panelList 是两次独立请求的结果，各自持有一个 Notification 实例，
   * 两者互不等价。`list.find(...) ?? panelList.find(...)` 只会命中其中一处，
   * 于是「在面板里点已读」后消息页那条仍是未读样式（反之亦然），
   * 而 unreadCount 已经减过一次 —— 数字与列表显示直接对不上。
   */
  async function markRead(id: string) {
    const targets = [
      ...list.value.filter(n => n.id === id),
      ...panelList.value.filter(n => n.id === id),
    ]
    if (targets.length === 0 || targets.every(n => n.isRead)) return
    targets.forEach(n => { n.isRead = true })
    if (unreadCount.value > 0) unreadCount.value--
    try {
      await notificationApi.markRead(id)
    } catch {
      // 回滚：把所有被改的实例一起改回去
      targets.forEach(n => { n.isRead = false })
      unreadCount.value++
    }
  }

  /**
   * 清空已读通知（从本地列表移除，同步调用后端删除）。
   *
   * ⚠️ 「有没有已读」必须看两个数组。早前只看 list 就提前 return，
   * 于是「面板里有已读、消息页一条都没翻过」时点了清空毫无反应。
   * 另外两处已读条数可能重复（同一 id 在 list 与 panelList 各一份），
   * 删除后 total/loadedCount 要按**实际少掉的条目数**扣减，
   * 否则 hasMore 会以为服务端还留着那些条目而多翻一页空页。
   */
  async function clearRead() {
    const hasReadInList = list.value.some(n => n.isRead)
    const hasReadInPanel = panelList.value.some(n => n.isRead)
    if (!hasReadInList && !hasReadInPanel) return
    // 乐观更新：先移除本地已读条目
    const prevList = [...list.value]
    const prevPanel = [...panelList.value]
    const removedFromList = list.value.length - list.value.filter(n => !n.isRead).length
    list.value = list.value.filter(n => !n.isRead)
    panelList.value = panelList.value.filter(n => !n.isRead)
    // 面板那部分不影响消息页的计数口径，只有消息页真正少掉的条数才扣 total
    if (removedFromList > 0) {
      loadedCount.value = Math.max(0, loadedCount.value - removedFromList)
      total.value = Math.max(0, total.value - removedFromList)
    }
    try {
      await notificationApi.clearRead()
      uni.showToast({ title: '已清空已读消息', icon: 'success' })
    } catch {
      // 失败回滚
      list.value = prevList
      panelList.value = prevPanel
      loadedCount.value += removedFromList
      total.value += removedFromList
      uni.showToast({ title: '清空失败，请重试', icon: 'none' })
    }
  }

  /** 全部已读 */
  async function markAllRead() {
    const unreadItems = list.value.filter(n => !n.isRead)
    const panelUnread = panelList.value.filter(n => !n.isRead)
    unreadItems.forEach(n => { n.isRead = true })
    panelUnread.forEach(n => { n.isRead = true })
    const prevCount = unreadCount.value
    unreadCount.value = 0
    try {
      await notificationApi.markAllRead()
    } catch {
      unreadItems.forEach(n => { n.isRead = false })
      panelUnread.forEach(n => { n.isRead = false })
      unreadCount.value = prevCount
    }
  }

  /**
   * 获取通知设置。
   * @returns 是否成功拿到后端真值。失败时 settings 保持原样，
   *          调用方**不得**拿默认值当作用户的意愿去做决策。
   */
  async function fetchSettings(): Promise<boolean> {
    try {
      const res = await notificationApi.getSettings()
      // request 已拆包 data 字段，res 直接是 NotificationSettings
      if (!res) return false
      settings.value = {
        // 后端字段可能缺失，一律用兜底值补齐，避免 UI 读到 undefined
        pushEnabled: res.pushEnabled ?? true,
        pushTypes: { ...DEFAULT_NOTIFICATION_TYPES, ...(res.pushTypes || {}) },
      }
      return true
    } catch {
      return false
    }
  }

  /** 更新系统推送总开关 */
  async function updatePushEnabled(enabled: boolean) {
    const prev = settings.value.pushEnabled
    settings.value.pushEnabled = enabled
    try {
      await notificationApi.updatePushEnabled(enabled)
    } catch {
      settings.value.pushEnabled = prev
      throw new Error('更新失败，请重试')
    }
  }

  /** 更新单个通知类型的开关 */
  async function updatePushType(type: NotificationType, enabled: boolean) {
    const prev = settings.value.pushTypes[type]
    settings.value.pushTypes[type] = enabled
    try {
      await notificationApi.updatePushTypes({ [type]: enabled } as NotificationTypeSettings)
    } catch {
      settings.value.pushTypes[type] = prev
      throw new Error('更新失败，请重试')
    }
  }

  /** 通知授权提示弹窗的延迟句柄，closeNotifPrompt / reset 时必须清掉 */
  let _promptTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 登录成功后调用：判断是否需要弹通知开启提示。
   * 条件：本地未记录过"已弹过"标记 且 后端设置 pushEnabled=false（未开过）。
   * App 端系统推送是长期订阅，没有配额语义，弹一次问清楚即可。
   * 延迟500ms 避免和登录弹窗动画冲突。
   */
  async function promptIfNeeded() {
    if (hasNotifPrompted()) return       // 已弹过，跳过
    // ⚠️ 拿不到后端真值时必须直接放弃：settings.pushEnabled 的初值是 true，
    // 早前这里在 fetchSettings 静默失败后仍继续执行，`if (pushEnabled) return`
    // 恒成立 → 弱网下整个安装周期**永远不会**弹通知授权，且没有补偿重试。
    const ok = await fetchSettings()
    if (!ok) return
    if (settings.value.pushEnabled) return  // 已开启，跳过
    scheduleNotifPrompt()
  }

  function scheduleNotifPrompt(delay = 500) {
    clearPromptTimer()
    _promptTimer = setTimeout(() => {
      _promptTimer = null
      showNotifPrompt.value = true
    }, delay)
  }

  function clearPromptTimer() {
    if (_promptTimer !== null) {
      clearTimeout(_promptTimer)
      _promptTimer = null
    }
  }

  /** NotificationPromptModal 关闭时调用 */
  function closeNotifPrompt() {
    clearPromptTimer()
    showNotifPrompt.value = false
  }

  /**
   * 开启系统推送前的权限检查。
   * Android 13+ 通知是运行时权限，必须显式申请；
   * 被永久拒绝时 ensureSystemPermission 会引导去系统设置。
   */
  async function requestSystemNotifyPermission(): Promise<boolean> {
    return ensureSystemPermission('notification', '开启系统通知后，活动变更才能及时提醒您')
  }

  /**
   * 收到 uni-push 后的统一刷新入口。
   *
   * 未读数必刷（角标是全局可见的）；列表只在**已经加载过**时才刷——
   * 通知面板没打开过就不必为一次推送拉整页数据，纯属浪费请求。
   *
   * ⚠️ 消息页列表这里**不刷**：用户可能正翻到第 5 页，push 到达时把列表
   * 重置成第 1 页会让滚动位置与内容错位。消息页自己在 onShow 时决定要不要重拉。
   */
  async function refreshAfterPush() {
    const jobs: Promise<unknown>[] = [fetchUnreadCount()]
    if (panelList.value.length > 0) jobs.push(fetchPanelList())
    await Promise.all(jobs)
  }

  /**
   * 登出 / 切换账号时清空。
   *
   * 由 userStore.clear() 同步调用 —— 必须同步，早前版本用动态 import + .then()
   * 会导致 clear() 返回时订阅态未清空。
   *
   * 先让在途响应失效再清 state，顺序不能反。
   * settings 也要复位：它是从后端拉的**上一个账号**的偏好，切号后若沿用，
   * 通知设置页会显示别人的开关状态，用户改任何一项都是改在错的对象上。
   */
  function reset() {
    _unreadSeq++
    _listSeq++
    _panelSeq++
    clearPromptTimer()

    list.value = []
    panelList.value = []
    total.value = 0
    loadedCount.value = 0
    unreadCount.value = 0
    // loading 不复位会让登出后的通知面板永远停在骨架屏
    loading.value = false
    settings.value = {
      pushEnabled: true,
      pushTypes: { ...DEFAULT_NOTIFICATION_TYPES },
    }
  }

  return {
    list, panelList, total, loadedCount, unreadCount, loading, settings,
    showNotifPrompt,
    hasUnread, badgeText, hasReadNotifications, hasMore,
    fetchUnreadCount, fetchList, fetchPanelList, markRead, markAllRead, clearRead,
    fetchSettings, updatePushEnabled, updatePushType,
    promptIfNeeded, closeNotifPrompt,
    requestSystemNotifyPermission,
    refreshAfterPush,
    reset,
  }
})
