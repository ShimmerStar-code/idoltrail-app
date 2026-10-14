/**
 * 打开外部链接（购票、官网等）。
 *
 * App 端用 plus.runtime.openURL 交给系统处理：http(s) 会被系统浏览器或
 * 已安装的票务 App（大麦、猫眼…）接管，scheme 则直接唤起对应应用。
 * H5 端只在开发调试时走到，用新窗口打开。
 */
export function openExternalUrl(url: string, label = '链接'): boolean {
  const target = (url || '').trim()
  if (!target) {
    uni.showToast({ title: '链接无效', icon: 'none' })
    return false
  }

  // 只放行 http/https 与常见 scheme，挡掉 javascript:、file: 这类
  // 后台误填或被篡改的地址 —— 内容来自 DB，渲染前先校验一次。
  if (!/^(https?:\/\/|[a-z][a-z0-9+.-]*:)/i.test(target)) {
    console.warn('[openExternal] 不支持的链接协议:', target)
    uni.showToast({ title: '链接无效', icon: 'none' })
    return false
  }

  // #ifdef APP-PLUS
  try {
    plus.runtime.openURL(target)
    return true
  } catch (e) {
    console.warn('[openExternal] openURL 失败', e)
    uni.showToast({ title: `无法打开${label}`, icon: 'none' })
    return false
  }
  // #endif

  // #ifndef APP-PLUS
  window.open(target, '_blank')
  return true
  // #endif
}