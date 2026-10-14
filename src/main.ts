import { createSSRApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

export function createApp() {
  const app = createSSRApp(App);
  app.use(createPinia());
  // App 端没有微信的转发/朋友圈钩子，分发能力统一由 src/utils/share.ts 封装
  return { app };
}
