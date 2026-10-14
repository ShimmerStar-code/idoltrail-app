import { defineConfig, loadEnv, type ConfigEnv } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

/**
 * 构建期环境校验。
 *
 * 漏配 VITE_API_BASE_URL 时，运行时兜底会静默指向 localhost，真机表现为全站空白 +
 * 控制台 network error，排查成本极高。所以放到构建这一步就 fail 掉：
 * 打包机上立刻能看到红色提示，而不是等到装机、启动、测试才暴露。
 */
function checkApiBaseUrl(mode: string, env: ConfigEnv) {
  const hint =
    "  请复制 .env.example 为 .env 并填入真机可访问的后端地址（手机无法访问 localhost）。";
  const baseUrl = (env.VITE_API_BASE_URL || "").trim();

  if (!baseUrl) {
    if (mode === "production") {
      throw new Error(`[build] 生产构建缺少 VITE_API_BASE_URL。${hint}`);
    }
    console.warn(`[build] 未配置 VITE_API_BASE_URL，接口将回退到 localhost。${hint}`);
    return;
  }

  if (mode === "production" && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(baseUrl)) {
    throw new Error(
      `[build] 生产构建的 VITE_API_BASE_URL 指向本机地址 ${baseUrl}，真机必然连不通。${hint}`
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
  if (mode !== "production") return;
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
  const env = loadEnv(mode, process.cwd(), "VITE_");
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