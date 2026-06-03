/**
 * A0 资产管线：把 emoji 母版（ProRes 4444 + alpha）批量转码为 Web 三件套，并写 manifest.json。
 *
 *   webm  —— VP9 + alpha（主交付，Chrome/Edge/Firefox/Safari16+）
 *   mov   —— HEVC + alpha（Safari 兜底；可用 --no-hevc 跳过）
 *   png   —— 首帧 poster（reduced-motion / 加载前 / 解码失败兜底）
 *
 * 用法：
 *   pnpm build:avatar                      # 全量
 *   pnpm build:avatar --only=calm,party    # 仅指定原语
 *   pnpm build:avatar --no-hevc            # 跳过 HEVC
 *   AVATAR_MASTERS=/abs/path pnpm build:avatar
 *
 * 设计要点：文件名只用「艺术原语 id」（与 emoji 序号、状态名彻底解耦）。
 * 换自研 IP 时：替换 masters + rename-map 即可，状态逻辑零改动（见 docs/06 §6）。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..");

const MASTERS = resolve(process.env.AVATAR_MASTERS ?? resolve(REPO_ROOT, "..", "Visual-State-Machine", "mov"));
const MAP_CSV = resolve(PKG_ROOT, "assets", "rename-map.csv");
const OUT_DIR = resolve(REPO_ROOT, "apps", "web", "public", "avatar");
const SIZE = Number(process.env.AVATAR_SIZE ?? 512); // 母版 750 → 512，显示 320–420，体积更小

interface Row { master: string; primitive: string }

function parseMap(csv: string): Row[] {
  return csv
    .split(/\r?\n/)
    .slice(1) // 跳过表头
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.lastIndexOf(",");
      return { master: line.slice(0, idx).trim(), primitive: line.slice(idx + 1).trim() };
    });
}

function parseArgs(argv: string[]): { only: Set<string> | null; hevc: boolean } {
  let only: Set<string> | null = null;
  let hevc = true;
  for (const a of argv) {
    if (a === "--no-hevc") hevc = false;
    else if (a.startsWith("--only=")) only = new Set(a.slice(7).split(",").map((s) => s.trim()).filter(Boolean));
  }
  return { only, hevc };
}

function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: ["ignore", "ignore", "inherit"] });
}

function buildOne(master: string, primitive: string, hevc: boolean): { hevc: boolean } {
  const src = resolve(MASTERS, `${master}.mov`);
  if (!existsSync(src)) throw new Error(`母版缺失: ${src}`);
  const scale = `scale=${SIZE}:${SIZE}:flags=lanczos`;
  const webm = resolve(OUT_DIR, `${primitive}.webm`);
  const png = resolve(OUT_DIR, `${primitive}.png`);
  const mov = resolve(OUT_DIR, `${primitive}.mov`);

  // 1) VP9 + alpha
  ffmpeg(["-i", src, "-vf", scale, "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
    "-b:v", "0", "-crf", "32", "-auto-alt-ref", "0", "-an", webm]);
  // 3) poster 首帧
  ffmpeg(["-i", src, "-vf", scale, "-frames:v", "1", png]);

  // 2) HEVC + alpha（videotoolbox；失败则降级跳过，不阻断管线）
  let hevcOk = false;
  if (hevc) {
    try {
      ffmpeg(["-i", src, "-vf", scale, "-c:v", "hevc_videotoolbox", "-alpha_quality", "0.9",
        "-pix_fmt", "bgra", "-tag:v", "hvc1", "-an", mov]);
      hevcOk = true;
    } catch {
      console.warn(`  ⚠ HEVC 转码失败，跳过（仅 webm+png）: ${primitive}`);
    }
  }
  return { hevc: hevcOk };
}

function main(): void {
  const { only, hevc } = parseArgs(process.argv.slice(2));
  if (!existsSync(MASTERS)) throw new Error(`母版目录不存在: ${MASTERS}（用 AVATAR_MASTERS 指定）`);
  mkdirSync(OUT_DIR, { recursive: true });

  const rows = parseMap(readFileSync(MAP_CSV, "utf8")).filter((r) => !only || only.has(r.primitive));
  if (rows.length === 0) throw new Error("没有匹配的原语可转码（检查 --only 或 rename-map.csv）");

  const manifest: Record<string, { webm: string; hevc?: string; poster: string }> = {};
  let i = 0;
  for (const { master, primitive } of rows) {
    i += 1;
    console.log(`[${i}/${rows.length}] ${master} → ${primitive}`);
    const { hevc: hevcOk } = buildOne(master, primitive, hevc);
    manifest[primitive] = {
      webm: `/avatar/${primitive}.webm`,
      ...(hevcOk ? { hevc: `/avatar/${primitive}.mov` } : {}),
      poster: `/avatar/${primitive}.png`,
    };
  }

  writeFileSync(resolve(OUT_DIR, "manifest.json"),
    JSON.stringify({ schema_version: "1.0", size: SIZE, primitives: manifest }, null, 2) + "\n");
  console.log(`✓ 完成 ${rows.length} 个原语 → ${OUT_DIR}`);
}

main();
