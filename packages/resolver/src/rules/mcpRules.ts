import type { McpLayer, Phase } from "@cq/dsl";

export interface McpRule {
  layer: McpLayer;
  phase: Phase;
}

/** 策展自 MCP_CLASSIFICATION_2026-06-01.md（L0–L5）。 */
export const MCP_RULES: Record<string, McpRule> = {
  "as-mate-tools": { layer: "L0", phase: "boot" },
  "image-gemini": { layer: "L1", phase: "production" },
  "music-search": { layer: "L1", phase: "production" },
  "image-postprocess": { layer: "L1", phase: "production" },
  "music-vertex": { layer: "L2", phase: "production" },
  "image-jimeng": { layer: "L2", phase: "production" },
  "asset3d-search": { layer: "L2", phase: "production" },
  "prompt-optimization": { layer: "L2", phase: "production" },
  "image-gpt": { layer: "L2", phase: "production" },
  "pixelart-pipeline": { layer: "L3", phase: "production" },
  "sidescroller-pipeline": { layer: "L3", phase: "production" },
  "forgea-game-server": { layer: "L4", phase: "coding" },
};

/** modality → mcp server 列表。 */
const MODALITY_MCP: Record<string, string[]> = {
  image: ["image-gemini", "image-postprocess"],
  audio: ["music-search", "music-vertex"],
  "3d": ["asset3d-search"],
  pixel: ["pixelart-pipeline"],
  sidescroller: ["sidescroller-pipeline"],
  ui: [],
  narrative: [],
  video: [],
};

export function mcpForModality(modality: string): string[] {
  return MODALITY_MCP[modality] ?? [];
}
