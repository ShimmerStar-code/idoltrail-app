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

export const useNotificationStore = defineStore('notification', () => {
  // ── state ──
  const list        = ref<Notification[]>([])
  const total       = ref(0)
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
  const hasReadNotifications = computed(() => list.value.some(n => n.isRead))

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

  // 面板最多展示条数
  const MAX_PANEL_SIZE = 50

  /** 拉取通知列表（第一页，弹框打开时调用） */
  async function fetchList(page = 1, page_size = 20) {
    const seq = ++_listSeq
    loading.value = true
    try {
      const res = await notificationApi.list(page, page_size)
      // 已有更新的请求发出 / 已登出 → 丢弃本次响应
      if (seq !== _listSeq) return
      // request 已拆包 data 字段，res 直接是 { list, total, page, page_size }
      if (page === 1) {
        list.value = res?.list ?? []
      } else {
        list.value.push(...(res?.list ?? []))
      }
      total.value = res?.total ?? 0
      // 本地限制：面板最多保留 MAX_PANEL_SIZE 条，避免无限累积
      if (list.value.length > MAX_PANEL_SIZE) {
        list.value = list.value.slice(0, MAX_PANEL_SIZE)
      }
    } catch (e) {
      console.error('[notification] fetchList failed', e)
    } finally {
      // 只有最新那次请求负责关闭 loading，避免旧请求提前把 loading 置 false
      if (seq === _listSeq) loading.value = false
    }
  }

  /** 标记单条已读 */
  async function markRead(id: string) {
    const item = list.value.find(n => n.id === id)
    if (!item || item.isRead) return
    item.isRead = true
    if (unreadCount.value > 0) unreadCount.value--
    try {
      await notificationApi.markRead(id)
    } catch {
      // 回滚
      item.isRead = false
      unreadCount.value++
    }
  }

  /** 清空已读通知（从本地列表移除，同步调用后端删除） */
  async function clearRead() {
    const readItems = list.value.filter(n => n.isRead)
    if (readItems.length === 0) return
    // 乐观更新：先移除本地已读条目
    const prevList = [...list.value]
    list.value = list.value.filter(n => !n.isRead)
    try {
      await notificationApi.clearRead()
      uni.showToast({ title: '已清空已读消息', icon: 'success' })
    } catch {
      // 失败回滚
      list.value = prevList
      uni.showToast({ title: '清空失败，请重试', icon: 'none' })
    }
  }

  /** 全部已读 */
  async function markAllRead() {
    const unreadItems = list.value.filter(n => !n.isRead)
    unreadItems.forEach(n => { n.isRead = true })
    const prevCount = unreadCount.value
    unreadCount.value = 0
    try {
      await notificationApi.markAllRead()
    } catch {
      unreadItems.forEach(n => { n.isRead = false })
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
   */
  async function refreshAfterPush() {
    const jobs: Promise<unknown>[] = [fetchUnreadCount()]
    if (list.value.length > 0) jobs.push(fetchList(1, 20))
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
    clearPromptTimer()

    list.value = []
    total.value = 0
    unreadCount.value = 0
    // loading 不复位会让登出后的通知面板永远停在骨架屏
    loading.value = false
    settings.value = {
      pushEnabled: true,
      pushTypes: { ...DEFAULT_NOTIFICATION_TYPES },
    }
  }

  return {
    list, total, unreadCount, loading, settings,
    showNotifPrompt,
    hasUnread, badgeText, hasReadNotifications,
    fetchUnreadCount, fetchList, markRead, markAllRead, clearRead,
    fetchSettings, updatePushEnabled, updatePushType,
    promptIfNeeded, closeNotifPrompt,
    requestSystemNotifyPermission,
    refreshAfterPush,
    reset,
  }
})
