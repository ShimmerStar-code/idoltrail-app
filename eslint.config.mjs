// ESLint 9 flat config。
// 排版（引号/分号/缩进）统一交给 prettier，ESLint 侧由 skip-formatting 关掉所有
// stylistic 规则，避免二者互相打架。
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import vueTsEslintConfig from '@vue/eslint-config-typescript'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      // pages.json 里 custom:true 要求存在此目录，由 pages.json + 各页面里的
      // 自研 <TabBar> 承担渲染，这里只是满足微信的目录约定，不是 TS/Vue 源码。
      'src/custom-tab-bar/**',

      // DCloud 第三方插件源码目录。当前一个插件都没有（uni-push 由 manifest
      // 内置注入、uni-id 未接入），但 HBuilderX 安装插件时会自动写进这里，
      // 保留忽略以免将来装一个插件就刷出一堆假 error（它们是压缩后的第三方源码）。
      'src/uni_modules/**',

      // URL 化云函数跑在 uniCloud 的 CommonJS Node 环境里，
      // require / exports / process / Buffer / uniCloud 都是合法的运行时全局，
      // 用上面的浏览器 ESM 规则去 lint 会刷出一堆假 error。
      'uniCloud-*/cloudfunctions/**',
    ],
  },

  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  ...vueTsEslintConfig(),

  {
    // 排版一律交给 prettier
    ...skipFormatting,
  },

  {
    rules: {
      // 条件编译（// #ifdef MP-WEIXIN）在 ESLint 眼里只是普通注释，
      // 同一段代码的多端实现不会被误判为重复声明。
      'no-redeclare': 'off',

      // 小程序没有条件 console 分发机制，console 是当前唯一的调试出口。
      'no-console': 'off',

      // 空 catch 是各 store 里刻意的 best-effort 静默兜底。
      'no-empty': ['error', { allowEmptyCatch: true }],

      // 下面几条存量较多（any 用于动态接口/小程序回调，组件名为 Index/List 等），
      // 一次性收紧会牵连上百处改动。此处先降为 warn 记录在案，
      // 待后续逐步收敛；改代码时请顺手替换掉 any。
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // shims-uni.d.ts 里 ComponentCustomOptions 必须继承 App & Page 实例，
      // TS 4.9 下无法用 extends 表达，这里是 uni-app 官方模板的固有写法。
      '@typescript-eslint/no-empty-object-type': 'off',

      // 以下均为样式类，不阻断构建
      'vue/multi-word-component-names': 'warn',
      'vue/attributes-order': 'warn',
      'vue/attribute-hyphenation': 'warn',
      'vue/v-on-event-hyphenation': 'warn',
    },
  },

  {
    files: ['src/**/*.vue'],
    rules: {
      // uni-app 的 <block> / <view> 等内置标签按原样书写，不套 HTML 规则
      'vue/no-undef-components': 'off',
    },
  },
]
