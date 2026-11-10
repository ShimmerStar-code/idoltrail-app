/* global require, process */
/* eslint-disable @typescript-eslint/no-require-imports */

const Module = require('node:module')
const { existsSync } = require('node:fs')

const target = process.env.UNI_UTS_COMPILER_PATH
if (!target || !existsSync(target)) {
  throw new Error(`UTS 编译器路径无效：${target || '(未设置)'}`)
}
const resolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  if (request === '@dcloudio/uni-uts-v1') return target
  return resolveFilename.call(this, request, ...args)
}
