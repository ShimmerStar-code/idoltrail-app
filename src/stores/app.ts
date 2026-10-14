// Pinia store：应用级全局状态（免责声明弹窗等）
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { hasDisclaimerShown, setDisclaimerShown } from '@/utils/storage'

export const useAppStore = defineStore('app', () => {
  // 是否显示免责声明弹窗
  const showDisclaimer = ref(false)

  /**
   * 检查并显示免责声明（首次启动时）
   */
  function checkAndShowDisclaimer() {
    if (!hasDisclaimerShown()) {
      showDisclaimer.value = true
    }
  }

  /**
   * 关闭免责声明弹窗，并记录已显示过
   */
  function closeDisclaimer() {
    showDisclaimer.value = false
    setDisclaimerShown()
  }

  return {
    showDisclaimer,
    checkAndShowDisclaimer,
    closeDisclaimer,
  }
})
