import { defineConfig, loadEnv, type ConfigEnv } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

/**
 * 环境标识归一。
 *
 * 本项目把构建配置规范为 .env.dev / .env.prod（字段一致，仅取值不同），
 * npm scripts 对应传 --mode=dev / --mode=prod。但 HBuilderX GUI 的
 * 「运行 / 发行」不经过 CLI，它写死用 development / production 这两个 mode，
 * 直接沿用会读不到任何 .env.* 文件。
 *
 * 所以把 Vite 内置的两个 mode 名映射到我们的命名，两条入口都能工作：
 *   HBuilderX GUI（mode=development）→ 读 .env.dev
 *   HBuilderX GUI（mode=production）  → 读 .env.prod
 *   npm run build:app（mode=prod）    → 读 .env.prod
 */
const MODE_ALIAS: Record<string, string> = {
  development: "dev",
  production: "prod",
};

function resolveEnvMode(mode: string): string {
  return MODE_ALIAS[mode] ?? mode;
}

/**
 * 是否生产构建。
 *
 * 不能只判 mode === "production"：改用 --mode=prod 后该判断恒为假，
 * checkAdminGate 会静默失效，管理后台入口直接打进 C 端发布包。
 *
 * 以 NODE_ENV 为准 —— Vite 在 resolveConfig 里把 build 命令的 defaultNodeEnv
 * 硬编码为 'production'，与 --mode 无关，因此它不受我们改名的影响。
 * 再叠加归一后的 mode 兜底，HBuilderX 与 CLI 两条路径都覆盖得到。
 */
function isProduction(mode: string): boolean {
  return process.env.NODE_ENV === "production" || resolveEnvMode(mode) === "prod";
}

/**
 * 构建期环境校验。
 *
 * 漏配 VITE_API_BASE_URL 时，运行时兜底会静默指向 localhost，真机表现为全站空白 +
 * 控制台 network error，排查成本极高。所以放到构建这一步就 fail 掉：
 * 打包机上立刻能看到红色提示，而不是等到装机、启动、测试才暴露。
 */
function checkApiBaseUrl(mode: string, env: ConfigEnv) {
  const hint =
    "  请在 .env.dev（开发）或 .env.prod（生产）中填入真机可访问的后端地址" +
    "（手机无法访问 localhost）。";
  const baseUrl = (env.VITE_API_BASE_URL || "").trim();
  const prod = isProduction(mode);

  if (!baseUrl) {
    if (prod) {
      throw new Error(`[build] 生产构建缺少 VITE_API_BASE_URL。${hint}`);
    }
    console.warn(`[build] 未配置 VITE_API_BASE_URL，接口将回退到 localhost。${hint}`);
    return;
  }

  if (!prod) return;

  if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(baseUrl)) {
    throw new Error(
      `[build] 生产构建的 VITE_API_BASE_URL 指向本机地址 ${baseUrl}，真机必然连不通。${hint}`
    );
  }

  // 隐私政策正文（src/constants/agreements.ts）明确承诺「全程 HTTPS」，
  // 且上架审核会核对实际行为。生产包里出现明文 HTTP 就是与承诺不符，
  // 属于合规问题，不只是"不推荐"。
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error(
      `[build] 生产构建的 VITE_API_BASE_URL 必须是 https，当前为 ${baseUrl}。` +
        `隐私政策已承诺全程 HTTPS，明文 HTTP 会造成合规风险。`
    );
  }

  // 测试服地址绝不能进生产包。此前守卫只拦 localhost，103.24.218.69 直接放行，
  // 于是 npm run build:app 产出的包会连测试数据库——真机上表现为
  // 「数据都是测试数据」或直接连不上，很难第一时间联想到构建配置。
  const TEST_HOSTS = ["103.24.218.69", "apitest.idoltrail.com", "admintest.idoltrail.com"];
  const hit = TEST_HOSTS.find((h) => baseUrl.includes(h));
  if (hit) {
    throw new Error(
      `[build] 生产构建的 VITE_API_BASE_URL 指向测试环境（${hit}）：${baseUrl}。` +
        `请在 .env.prod 中改为生产域名。`
    );
  }
}

/**
 * 管理后台入口封禁。
 *
 * pages/admin 下的登录页一旦打进 C 端包，反编译即可发现 /admin/login 并直接爆破。
 * 正式发布包强制把开关按死为 false，让 ADMIN_ENABLED 编译期即折叠成常量 false，
 * 整段 admin 代码会被 tree-shaking 一并剔除。
 */
function checkAdminGate(mode: string, env: ConfigEnv) {
  if (!isProduction(mode)) return;
  if ((env.VITE_ADMIN_ENABLED || "") === "true") {
    console.warn(
      "[build] 已忽略 VITE_ADMIN_ENABLED=true：生产包强制关闭管理后台入口。" +
        "后台管理请使用独立的服务端控制台。"
    );
  }
  // 注意：必须写 process.env。loadEnv 的返回值是副本，改它不会影响 Vite 后续
  // 注入 import.meta.env 的结果（那份来自 process.env + loadEnv 的合并）。
  process.env.VITE_ADMIN_ENABLED = "false";
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // HBuilderX GUI 传的 development/production 归一到 dev/prod，
  // 保证 GUI 运行时也能读到 .env.dev / .env.prod。
  const envMode = resolveEnvMode(mode);
  const env = loadEnv(envMode, process.cwd(), "VITE_");
  // Vite 自己只会按它拿到的 mode（即 development/production）去加载
  // .env.[mode]，找不到就是空。这里把归一后的结果补进 process.env，
  // 让 import.meta.env 拿到配置——CLI 已传 --mode 时这一步是幂等的。
  if (envMode !== mode) {
    Object.assign(process.env, env);
  }
  checkApiBaseUrl(mode, env);
  checkAdminGate(mode, env);

  return {
    plugins: [uni()],
    build: {
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: true,   // 生产包去掉 console.log/warn
          drop_debugger: true,
        },
      },
    },
  };
});