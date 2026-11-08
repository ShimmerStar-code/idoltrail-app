/**
 * Mobilerun 云真机 CLI —— 用云端 Android/iOS 真机跑 App 自动化。
 *
 * 认证：环境变量 MOBILERUN_CLOUD_API_KEY（mobilerun.ai 控制台拿）
 *
 * 用法：
 *   node scripts/mobilerun/cli.mjs devices                 列出可用设备
 *   node scripts/mobilerun/cli.mjs shot    <deviceId> [out.png]
 *   node scripts/mobilerun/cli.mjs ui      <deviceId>        读 UI 元素树
 *   node scripts/mobilerun/cli.mjs install <deviceId> <apk>  上传并安装 APK
 *   node scripts/mobilerun/cli.mjs launch  <deviceId> [pkg]   启动 App
 *   node scripts/mobilerun/cli.mjs tap     <deviceId> <x> <y>
 *   node scripts/mobilerun/cli.mjs swipe   <deviceId> <x1> <y1> <x2> <y2> [ms]
 *   node scripts/mobilerun/cli.mjs text    <deviceId> <content>
 *   node scripts/mobilerun/cli.mjs key     <deviceId> <keyCode>   例如 4 = 返回键
 *   node scripts/mobilerun/cli.mjs link    <deviceId> <deeplink>
 *   node scripts/mobilerun/cli.mjs apps    <deviceId>        已装应用
 *
 * deviceId 取自 `devices` 子命令输出。
 */
import fs from "node:fs";
import path from "node:path";
import Mobilerun from "@mobilerun/sdk";

const DEFAULT_PACKAGE = "io.dcloud.idoltrail";

const key = process.env.MOBILERUN_CLOUD_API_KEY;
if (!key) {
  console.error(
    "缺少 MOBILERUN_CLOUD_API_KEY 环境变量。\n" +
      "  当前会话: $env:MOBILERUN_CLOUD_API_KEY='你的 key'\n" +
      "  永久生效: [Environment]::SetEnvironmentVariable('MOBILERUN_CLOUD_API_KEY','你的 key','User')",
  );
  process.exit(1);
}

const client = new Mobilerun({ apiKey: key });
const [, , cmd, ...args] = process.argv;

function need(n, ...names) {
  if (args.length < n) {
    console.error(`用法：${cmd} ${names.map((s) => `<${s}>`).join(" ")}`);
    process.exit(2);
  }
}

/** 把 capture 返回值（presigned URL / data URL / base64）落盘成 PNG */
async function saveScreenshot(deviceId, out) {
  const shotId = await client.devices.screenshots.capture(deviceId);
  const file = path.resolve(out ?? `shot-${deviceId.slice(0, 8)}.png`);

  let buf = null;
  if (Buffer.isBuffer(shotId)) {
    buf = shotId;
  } else if (typeof shotId === "string" && shotId.startsWith("http")) {
    const r = await fetch(shotId);
    buf = Buffer.from(await r.arrayBuffer());
  } else if (typeof shotId === "string") {
    // 可能是 presigned URL 之外的字符串：先按 data URL / base64 试
    const b64 = shotId.startsWith("data:") ? shotId.slice(shotId.indexOf(",") + 1) : shotId;
    buf = Buffer.from(b64, "base64");
  }
  if (!buf || buf.length === 0) throw new Error(`截图内容为空：${String(shotId).slice(0, 200)}`);
  fs.writeFileSync(file, buf);
  console.log(`截图已保存：${file}（${buf.length} 字节）`);
}

async function main() {
  switch (cmd) {
    case "devices": {
      const res = await client.devices.list();
      const items = res.items ?? [];
      if (!items.length) {
        console.log("没有可用设备。");
        return;
      }
      for (const d of items) {
        console.log(
          `${d.id}  ${d.platform}/${d.state}  ${d.name}  type=${d.type}  tasks=${d.taskCount}`,
        );
      }
      return;
    }
    case "shot": {
      need(1, "deviceId");
      await saveScreenshot(args[0], args[1]);
      return;
    }
    case "ui": {
      need(1, "deviceId");
      const res = await client.devices.state.ui(args[0]);
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    case "install": {
      need(2, "deviceId", "apk");
      const apk = path.resolve(args[1]);
      if (!fs.existsSync(apk)) throw new Error(`APK 不存在：${apk}`);
      console.log(`上传 ${apk} …`);
      // 先把 APK 推到设备，再让后端从设备本地路径安装
      await client.devices.files.upload(args[0], {
        path: "/data/local/tmp/",
        file: fs.createReadStream(apk),
      });
      const remote = `/data/local/tmp/${path.basename(apk)}`;
      console.log(`安装 ${remote} …`);
      await client.devices.apps.install(args[0], { path: remote });
      console.log("安装完成");
      return;
    }
    case "launch": {
      need(1, "deviceId");
      const pkg = args[1] ?? DEFAULT_PACKAGE;
      await client.devices.apps.start(pkg, { deviceId: args[0] });
      console.log(`已启动 ${pkg}`);
      return;
    }
    case "tap": {
      need(3, "deviceId", "x", "y");
      await client.devices.actions.tap(args[0], { x: Number(args[1]), y: Number(args[2]) });
      console.log(`tap(${args[1]}, ${args[2]})`);
      return;
    }
    case "swipe": {
      need(5, "deviceId", "x1", "y1", "x2", "y2");
      await client.devices.actions.swipe(args[0], {
        startX: Number(args[1]),
        startY: Number(args[2]),
        endX: Number(args[3]),
        endY: Number(args[4]),
        duration: args[5] ? Number(args[5]) : 300,
      });
      console.log("swipe done");
      return;
    }
    case "text": {
      need(2, "deviceId", "content");
      await client.devices.keyboard.write(args[0], { text: args[1] });
      console.log("text input done");
      return;
    }
    case "key": {
      need(2, "deviceId", "keyCode");
      await client.devices.keyboard.key(args[0], { key: Number(args[1]) });
      console.log(`key(${args[1]})`);
      return;
    }
    case "link": {
      need(2, "deviceId", "deepLink");
      await client.devices.deepLink.executeDeepLink(args[0], { deepLink: args[1] });
      console.log(`deepLink ${args[1]}`);
      return;
    }
    case "apps": {
      need(1, "deviceId");
      const res = await client.devices.apps.list(args[0]);
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    default:
      console.error(`未知子命令：${cmd ?? "(空)"}`);
      console.error("可用：devices | shot | ui | install | launch | tap | swipe | text | key | link | apps");
      process.exit(2);
  }
}

main().catch((e) => {
  console.error("失败：", e?.message ?? e);
  if (e?.statusCode) console.error("HTTP", e.statusCode);
  process.exit(1);
});
