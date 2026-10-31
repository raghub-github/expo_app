/**
 * Compiles and runs the Android-free half of the native alert stack on a plain JVM.
 *
 * The injected Java is never compiled by CI and never type-checked by tsc, so
 * without this it ships on inspection alone. Only the classes with no Android
 * imports are built here; the rest is covered by the syntax pass below, which
 * templates every source and keeps only diagnostics that a missing Android SDK
 * cannot explain.
 *
 * Skips (exit 0) when no JDK is present, so a machine without one does not fail
 * the suite — the point is to run it everywhere a JDK exists, including CI.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(here, "..", "plugin", "android-src");
const TEST_DIR = join(here, "..", "plugin", "android-test");

/** Classes free of Android imports — these compile and run for real. */
const PURE = ["OrderAlertAcceptPlan.java", "OrderAlertCardText.java"];

const ROLES = [
  { role: "rider", pkg: "com.gatimitra.rider" },
  { role: "merchant", pkg: "com.gatimitra.partner" },
];

function tool(name) {
  const probe = spawnSync(name, ["-version"], { encoding: "utf8" });
  if (!probe.error) return name;
  const home = process.env.JAVA_HOME;
  if (home) {
    const full = join(home, "bin", name);
    if (!spawnSync(full, ["-version"], { encoding: "utf8" }).error) return full;
  }
  return null;
}

const javac = tool("javac");
const java = tool("java");
if (!javac || !java) {
  console.log("order-alert native: no JDK on PATH or JAVA_HOME — skipped");
  process.exit(0);
}

function template(text, { pkg, role }) {
  return text
    .replaceAll("{{PACKAGE}}", pkg)
    .replaceAll("{{ROLE}}", role)
    .replaceAll("{{ONGOING_CHANNEL_ID}}", "order_alert_fgs_ongoing_v1");
}

/**
 * Cross-check every call the Android-dependent sources make into the pure
 * classes against the methods those classes actually declare.
 *
 * This exists because the javac pass below cannot do it. Once `android.*` is
 * unresolved, javac abandons attribution of those files, so a typo'd method
 * name on OrderAlertCardText compiles exactly as cleanly as a correct one —
 * verified by deliberately breaking one. Parsing is all that pass proves, and
 * this seam is the part most likely to rot.
 */
function checkPureApiUsage(sources) {
  const declared = new Map();
  for (const [file, text] of sources) {
    const cls = file.replace(/\.java$/, "");
    if (!PURE.includes(file)) continue;
    const names = new Set();
    for (const m of text.matchAll(/\b(?:public|static|\s)+[\w<>\[\]]+\s+(\w+)\s*\(/g)) {
      names.add(m[1]);
    }
    declared.set(cls, names);
  }
  const problems = [];
  for (const [file, text] of sources) {
    if (PURE.includes(file)) continue;
    for (const m of text.matchAll(/\b(OrderAlertCardText|OrderAlertAcceptPlan)\.(\w+)\s*\(/g)) {
      const [, cls, method] = m;
      if (!declared.get(cls)?.has(method)) {
        problems.push(`${file}: ${cls}.${method}() is not declared on ${cls}`);
      }
    }
  }
  return problems;
}

/**
 * Packages only the Android SDK and its friends can supply. Anything resolving
 * against these is expected to fail here; anything else is our own mistake.
 */
const ABSENT_PACKAGES =
  /^(android|androidx|com\.google\.(firebase|android)|com\.facebook\.react|expo|org\.json|dalvik)\b/;

/**
 * A diagnostic the absent Android SDK fully explains, and nothing else.
 *
 * `cannot find symbol` is the dangerous one to blanket-ignore: a typo'd method
 * or an out-of-scope variable reports identically to a missing SDK class. So an
 * unresolved *class* is tolerated only when it is one the SDK owns, and an
 * unresolved method or variable is never tolerated at all.
 */
function classifyDiagnostics(stderr) {
  const lines = String(stderr ?? "").split(/\r?\n/);
  const real = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("error:")) continue;
    if (/package [\w.]+ does not exist/.test(line)) {
      const pkg = line.match(/package ([\w.]+) does not exist/)?.[1] ?? "";
      if (ABSENT_PACKAGES.test(pkg)) continue;
      real.push(line);
      continue;
    }
    if (/cannot access ([\w.]+)/.test(line)) {
      const name = line.match(/cannot access ([\w.]+)/)?.[1] ?? "";
      if (ABSENT_PACKAGES.test(name)) continue;
      real.push(line);
      continue;
    }
    if (/cannot find symbol/.test(line)) {
      // javac prints the detail on a following "  symbol: <kind> <name>" line.
      const detail = lines.slice(i + 1, i + 4).find((l) => l.includes("symbol:")) ?? "";
      const match = detail.match(/symbol:\s+(\w+)\s+([\w.]+)/);
      const kind = match?.[1] ?? "";
      const name = match?.[2] ?? "";
      // Only an SDK-owned *class* may go unresolved. A missing method or
      // variable is ours, and is a real break.
      if (kind === "class" && SDK_CLASSES.has(name)) continue;
      real.push(`${line.trim()}  [${detail.trim() || "no detail"}]`);
      continue;
    }
    real.push(line);
  }
  return real;
}

/** Android / Firebase / React Native / org.json classes this JVM cannot have. */
const SDK_CLASSES = new Set([
  "AudioAttributes",
  "AudioFocusRequest",
  "AudioManager",
  "BroadcastReceiver",
  "Context",
  "ExpoFirebaseMessagingService",
  "Intent",
  "JSONArray",
  "JSONObject",
  "MediaPlayer",
  "RemoteMessage",
  "SharedPreferences",
]);

const work = mkdtempSync(join(tmpdir(), "gm-order-alert-"));
let failures = 0;
try {
  for (const target of ROLES) {
    const pkgPath = join(work, target.role, ...target.pkg.split("."));
    mkdirSync(pkgPath, { recursive: true });

    const allSources = readdirSync(SRC_DIR).filter((f) => f.endsWith(".java"));
    const rendered = new Map();
    for (const file of allSources) {
      const text = template(readFileSync(join(SRC_DIR, file), "utf8"), target);
      rendered.set(file, text);
      writeFileSync(join(pkgPath, file), text, "utf8");
    }

    // 0. The seam javac cannot check once the Android SDK is missing.
    const apiProblems = checkPureApiUsage(rendered);
    if (apiProblems.length > 0) {
      failures += apiProblems.length;
      console.log(`  ${target.role}: ${apiProblems.length} bad call(s) into the pure classes`);
      for (const line of apiProblems) console.log(`    ${line}`);
    }
    for (const file of readdirSync(TEST_DIR).filter((f) => f.endsWith(".java"))) {
      writeFileSync(
        join(pkgPath, file),
        template(readFileSync(join(TEST_DIR, file), "utf8"), target),
        "utf8"
      );
    }

    // 1. Parse gate over every injected source. Parsing is genuinely all this
    //    proves for the Android-dependent files — see checkPureApiUsage.
    const syntax = spawnSync(
      javac,
      ["-d", join(work, `syntax-${target.role}`), ...allSources.map((f) => join(pkgPath, f))],
      { encoding: "utf8" }
    );
    const real = classifyDiagnostics(syntax.stderr);
    if (real.length > 0) {
      failures += real.length;
      console.log(`  ${target.role}: ${real.length} unexplained javac diagnostic(s)`);
      for (const line of real.slice(0, 12)) console.log(`    ${line}`);
    }

    // 2. Compile and run the pure classes for real.
    const outDir = join(work, `run-${target.role}`);
    const build = spawnSync(
      javac,
      [
        "-d",
        outDir,
        ...PURE.map((f) => join(pkgPath, f)),
        join(pkgPath, "OrderAlertNativeTest.java"),
      ],
      { encoding: "utf8" }
    );
    if (build.status !== 0) {
      failures += 1;
      console.log(`  ${target.role}: test build failed\n${build.stderr}`);
      continue;
    }
    const run = spawnSync(java, ["-cp", outDir, `${target.pkg}.OrderAlertNativeTest`], {
      encoding: "utf8",
    });
    process.stdout.write(run.stdout ?? "");
    if (run.status !== 0) {
      failures += 1;
      process.stderr.write(run.stderr ?? "");
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`order-alert native: ${failures} failure(s)`);
  process.exit(1);
}
console.log("order-alert native: ok");
