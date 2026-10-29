// 业务代码统一用 withLogin 包裹"需要登录"的操作
// 已登录 → 直接执行；未登录 → 弹全局 modal，等登录完成再执行
// 用户在 modal 里点取消 → resolve(null)，由业务方决定怎么兜底
import { computed } from 'vue'
import { useUserStore } from '@/stores/user'

export interface WithLoginOptions {
  /** true=可关闭（点 × / 暂不登录），false=强制登录。默认 true */
  dismissible?: boolean
  /** 唤起原因，便于埋点 */
  reason?: string
}

/**
 * 业务侧用：
 *   const ok = await withLogin(() => subscriptionApi.subscribeArtist(artistId))
 *   if (ok) uni.showToast({ title: '已订阅' })
 *
 * 用户在登录弹窗里点取消 → resolve(null)，调用方要自己判空兜底。
 */
export function withLogin<T>(
  fn: () => T | Promise<T>,
  opts: WithLoginOptions = {},
): Promise<T | null> {
  const store = useUserStore()
  // 已登录 → 直接跑
  if (store.isLoggedIn) {
    return Promise.resolve(fn())
  }
  // 未登录 → 弹 modal，await 登录结果
  return new Promise((resolve) => {
    let settled = false
    const done = (result: T | null) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    store.requireLogin({
      // ⚠️ 必须在这里兜底默认值：opts 默认值只在**整个 opts 被省略**时生效，
      // 调用方传了 { reason: 'x' } 时 dismissible 仍是 undefined，
      // 而 LoginModal 里 `!!undefined === false`，会把本该可关闭的弹窗变成强制登录。
      dismissible: opts.dismissible ?? true,
      reason: opts.reason,
      onSuccess: async () => {
        try {
          const r = await fn()
          done(r)
        } catch (e) {
          // 业务报错：把结果设 null 让业务方自己处理
          console.error('[withLogin] business fn error', e)
          done(null)
        }
      },
      onCancel: () => done(null),
    })
  })
}

/**
 * 页面级守卫：进入页面前必须登录，否则弹 modal 并锁定页面（不渲染主体）。
 * 用法：在 setup 顶部
 *   const guard = useLoginGuard()
 *   if (!guard.ok.value) return guard.Render  // 占位
 *   // ... 渲染主体
 */
export function useLoginGuard(opts: { dismissible?: boolean; reason?: string } = {}) {
  const store = useUserStore()
  const ok = computed(() => store.isLoggedIn)

  function requireOrPrompt() {
    if (!ok.value) {
      store.requireLogin({ dismissible: opts.dismissible ?? false, reason: opts.reason })
    }
  }

  return { ok, requireOrPrompt }
}
