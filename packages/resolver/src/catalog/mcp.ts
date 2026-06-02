import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { McpEntry } from "./types.js";

interface RawMcpServices {
  apps?: Array<{ name?: string; env?: { MCP_PORT?: string } }>;
}

/**
 * 非 vag-mcp 的核心平台 MCP（独立注册，不在 mcp-services.json 内）。
 * 来源：MCP_CLASSIFICATION_2026-06-01.md D2（注册/传输）。
 */
const CORE_PLATFORM_MCP: McpEntry[] = [
  { server: "as-mate-tools", port: "15200" },
  { server: "forgea-game-server", port: "15180" },
  { server: "kino-mcp", port: "15201" },
];

export function readMcpServers(forgeaxRoot: string): McpEntry[] {
  const path = resolve(forgeaxRoot, "packages/vag_mcp/deploy/mcp-services.json");
  let vag: McpEntry[] = [];
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as RawMcpServices;
      vag = (raw.apps ?? [])
        .filter((a): a is { name: string; env?: { MCP_PORT?: string } } => typeof a.name === "string")
        .map((a) => ({ server: a.name, port: a.env?.MCP_PORT }));
    } catch {
      vag = [];
    }
  }
  const seen = new Set(vag.map((m) => m.server));
  return [...vag, ...CORE_PLATFORM_MCP.filter((m) => !seen.has(m.server))];
}
