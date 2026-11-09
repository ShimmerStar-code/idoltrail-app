/**
 * Mobilerun 云真机 · App 功能自动化测试
 *
 * 直接调 Mobilerun SDK 跑真机（不经过 MCP）：
 *   选设备 → 传 APK → 安装 → 启动 → 逐步操作 → 截图 + UI 树断言 → 报告
 *
 * 认证：环境变量 MOBILERUN_CLOUD_API_KEY
 *
 * 用法：
 *   node scripts/mobilerun/app-test.mjs --apk <apk路径> [--device <deviceId>] [--package <包名>] [--steps smoke,tabs,search,calendar]
 *   node scripts/mobilerun/app-test.mjs --list-devices
 *
 * 产物：artifacts/mobilerun/<时间戳>/ 下每步一张截图 + report.json
 */
import fs from "node:fs";
import path from "node:path";
import Mobilerun from "@mobilerun/sdk";

const argv = process.argv.slice(2);
function arg(name, fallback = undefined) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const apiKey = process.env.MOBILERUN_CLOUD_API_KEY;
if (!apiKey) {
  console.error(
    "缺少 MOBILERUN_CLOUD_API_KEY。\n" +
      "  当前会话: $env:MOBILERUN_CLOUD_API_KEY='<key>'\n" +
      "  永久生效: [Environment]::SetEnvironmentVariable('MOBILERUN_CLOUD_API_KEY','<key>','User')",
  );
  process.exit(1);
}

const client = new Mobilerun({ apiKey });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve("artifacts/mobilerun", stamp);
fs.mkdirSync(outDir, { recursive: true });

const results = [];
let failed = 0;

function log(msg) {
  console.log(msg);
}

async function shot(deviceId, name) {
  const raw = await client.devices.screenshots.capture(deviceId);
  let buf = null;
  if (Buffer.isBuffer(raw)) buf = raw;
  else if (typeof raw === "string" && raw.startsWith("http")) {
    const r = await fetch(raw);
    buf = Buffer.from(await r.arrayBuffer());
  } else if (typeof raw === "string") {
    const b64 = raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;
    buf = Buffer.from(b64, "base64");
  }
  if (!buf?.length) return null;
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, buf);
  return file;
}

/** 递归把 a11y 树摊平成可搜索的元素列表 */
function flatten(node, out = []) {
  if (!node) return out;
  out.push(node);
  for (const c of node.children ?? []) flatten(c, out);
  return out;
}

async function ui(deviceId) {
  const res = await client.devices.state.ui(deviceId);
  return flatten(res?.a11y_tree);
}

/** 断言：UI 树里存在包含 keyword 的可见文本 */
function assertText(deviceId, elements, keyword, step) {
  const hit = elements.find(
    (e) => e.isVisibleToUser !== false && String(e.text ?? "").includes(keyword),
  );
  if (hit) {
    results.push({ step, ok: true, keyword });
    log(`  ✓ ${step}：找到「${keyword}」`);
  } else {
    failed++;
    results.push({ step, ok: false, keyword });
    log(`  ✗ ${step}：没找到「${keyword}」`);
  }
  return hit;
}

/** 按文本点一个元素（点其中心） */
async function tapText(deviceId, elements, keyword) {
  const el = elements.find(
    (e) =>
      e.isVisibleToUser !== false &&
      e.isClickable !== false &&
      String(e.text ?? "").includes(keyword),
  );
  if (!el) {
    failed++;
    results.push({ step: `tap:${keyword}`, ok: false });
    log(`  ✗ 点不到「${keyword}」`);
    return false;
  }
  const b = el.boundsInScreen ?? {};
  const x = Math.round((b.left + b.right) / 2);
  const y = Math.round((b.top + b.bottom) / 2);
  await client.devices.actions.tap(deviceId, { x, y });
  await new Promise((r) => setTimeout(r, 1200));
  log(`  → tap「${keyword}」@ (${x}, ${y})`);
  return true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pickDevice(explicit) {
  if (explicit && explicit !== true) return explicit;
  const res = await client.devices.list();
  const items = (res.items ?? []).filter((d) => d.platform === "android");
  if (!items.length) {
    console.error("没有可用的 Android 云真机。");
    process.exit(1);
  }
  const free = items.find((d) => !d.activeTaskId) ?? items[0];
  log(`使用设备：${free.id}  ${free.name}  state=${free.state}`);
  return free.id;
}

async function main() {
  if (arg("list-devices")) {
    const res = await client.devices.list();
    for (const d of res.items ?? []) {
      log(`${d.id}  ${d.platform}/${d.state}  ${d.name}  type=${d.type}`);
    }
    return;
  }

  const apkArg = arg("apk");
  if (!apkArg || apkArg === true) {
    console.error("必须给 --apk <路径>");
    process.exit(2);
  }
  const apk = path.resolve(String(apkArg));
  if (!fs.existsSync(apk)) {
    console.error(`APK 不存在：${apk}`);
    process.exit(2);
  }

  const deviceId = await pickDevice(arg("device"));
  const pkg = String(arg("package", "") || "");
  const steps = String(arg("steps", "smoke,tabs")).split(",").map((s) => s.trim());

  log(`\nAPK：${apk}`);
  log(`产物目录：${outDir}\n`);

  // ── 安装 ──
  log("[1/4] 上传并安装 APK …");
  await client.devices.files.upload(deviceId, {
    path: "/data/local/tmp/",
    file: fs.createReadStream(apk),
  });
  const remote = `/data/local/tmp/${path.basename(apk)}`;
  await client.devices.apps.install(deviceId, { path: remote });
  log(`  安装完成：${remote}`);

  // 包名：优先用命令行给的，否则从已装列表里找
  let packageName = pkg;
  if (!packageName) {
    const apps = await client.devices.apps.list(deviceId);
    const list = apps?.items ?? apps ?? [];
    const arr = Array.isArray(list) ? list : [];
    const hit = arr.find((a) => String(a.packageName ?? a.name ?? "").includes("idoltrail"));
    packageName = hit?.packageName ?? hit?.name ?? "";
    log(`  检测到包名：${packageName || "(未识别)"}`);
  }
  if (!packageName) {
    console.error("无法确定包名，请用 --package <包名> 指定。");
    process.exit(2);
  }

  // ── 启动 ──
  log(`[2/4] 启动 ${packageName} …`);
  await client.devices.apps.start(packageName, { deviceId });
  await sleep(4000);
  await shot(deviceId, "00-launch");
  log("  首屏截图已保存");

  // ── 断言 ──
  log("[3/4] 断言 UI …");
  let elements = await ui(deviceId);

  if (steps.includes("smoke") || steps.includes("all")) {
    // 底部 4 个 tab
    for (const t of ["演出", "偶像", "订阅", "Me"]) {
      assertText(deviceId, elements, t, "smoke:底部导航");
    }
  }

  if (steps.includes("tabs") || steps.includes("all")) {
    for (const t of ["偶像", "订阅", "Me", "演出"]) {
      if (await tapText(deviceId, elements, t)) {
        await sleep(1500);
        await shot(deviceId, `tab-${t}`);
        elements = await ui(deviceId);
        assertText(deviceId, elements, t, `tabs:${t}页已打开`);
      }
    }
  }

  if (steps.includes("search") || steps.includes("all")) {
    // 首页搜索：点搜索框 → 输入关键词 → 断言结果
    elements = await ui(deviceId);
    const searchEl = elements.find(
      (e) => e.isVisibleToUser !== false && /搜索/.test(String(e.text ?? "")),
    );
    if (searchEl) {
      const b = searchEl.boundsInScreen ?? {};
      await client.devices.actions.tap(deviceId, {
        x: Math.round((b.left + b.right) / 2),
        y: Math.round((b.top + b.bottom) / 2),
      });
      await sleep(1200);
      await shot(deviceId, "search-open");
      await client.devices.keyboard.write(deviceId, { text: "周深" });
      await sleep(2500);
      await shot(deviceId, "search-result");
      elements = await ui(deviceId);
      assertText(deviceId, elements, "周深", "search:结果含关键词");
      await client.devices.keyboard.key(deviceId, { key: 4 }); // 返回键
    } else {
      failed++;
      results.push({ step: "search:找到搜索框", ok: false });
      log("  ✗ 找不到搜索框");
    }
  }

  if (steps.includes("calendar") || steps.includes("all")) {
    // 活动列表页 → 日历胶囊 → 断言格子场次 → 收起
    elements = await ui(deviceId);
    if (await tapText(deviceId, elements, "查看全部") || await tapText(deviceId, elements, "活动")) {
      await sleep(2000);
      elements = await ui(deviceId);
      if (await tapText(deviceId, elements, "日历")) {
        await sleep(2000);
        await shot(deviceId, "calendar-open");
        elements = await ui(deviceId);
        const withCount = elements.filter((e) => /\d+场/.test(String(e.text ?? "")));
        if (withCount.length) {
          results.push({ step: "calendar:格子显示场次", ok: true });
          log(`  ✓ calendar：${withCount.length} 个格子带场次`);
        } else {
          failed++;
          results.push({ step: "calendar:格子显示场次", ok: false });
          log("  ✗ calendar：没有任何格子显示场次");
        }
      }
    }
  }

  // ── 报告 ──
  log("[4/4] 写报告 …");
  fs.writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify({ deviceId, packageName, apk, steps, results, failed }, null, 2),
  );
  log(`报告：${path.join(outDir, "report.json")}`);

  const total = results.length;
  log(`\n结果：${total - failed}/${total} 通过${failed ? `，${failed} 失败` : ""}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("运行失败：", e?.message ?? e);
  if (e?.statusCode) console.error("HTTP", e.statusCode);
  process.exit(1);
});
