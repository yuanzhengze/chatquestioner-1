import type { SkillLayer, Phase, LoadMode } from "@cq/dsl";

export interface SkillRule {
  layer: SkillLayer;
  phase: Phase;
  defaultLoad: LoadMode;
}

/**
 * 策展自 SKILL_CLASSIFICATION_2026-06-01.md。
 * ⚠ 不含 pack-search —— resolver 本身就是它的离线替代。
 */
export const SKILL_RULES: Record<string, SkillRule> = {
  // L0 常驻核心
  H_2D_LookMaster: { layer: "L0", phase: "production", defaultLoad: "eager" },
  "game-audio": { layer: "L0", phase: "production", defaultLoad: "eager" },
  "game-template-optimizer": { layer: "L0", phase: "production", defaultLoad: "eager" },
  "H-3d-LookMaster": { layer: "L0", phase: "production", defaultLoad: "gated" },
  H_3d_ScaleNormalizer: { layer: "L0", phase: "production", defaultLoad: "gated" },
  "generate-game-cover": { layer: "L0", phase: "production", defaultLoad: "eager" },
  "3D_AssetLibrary": { layer: "L0", phase: "production", defaultLoad: "gated" },
  "bgm-lifecycle": { layer: "L0", phase: "production", defaultLoad: "gated" },
  // L1/L2 条件触发（节选；可扩展）
  "vfx-3d": { layer: "L1", phase: "production", defaultLoad: "gated" },
  "2D_vfx": { layer: "L1", phase: "production", defaultLoad: "gated" },
  "2D_ai_pixel_generation": { layer: "L2", phase: "production", defaultLoad: "gated" },
  "h-3d-world-builder": { layer: "L1", phase: "production", defaultLoad: "gated" },
  "towerdefense-tower": { layer: "L2", phase: "production", defaultLoad: "gated" },
  "2D_sidescroller_assets": { layer: "L2", phase: "production", defaultLoad: "gated" },
};

/** 恒选的 L0 核心（与维度无关）。 */
export const L0_CORE_SKILLS = [
  "game-template-optimizer",
  "generate-game-cover",
] as const;

/**
 * trigger → skill 名列表。trigger 形如 "dimension:2D" / "dimension:3D" /
 * "modality:audio" / "art_style:pixel" / "genre:tower-defense" / "modality:sidescroller"。
 */
const TRIGGER_SKILLS: Record<string, string[]> = {
  "dimension:2D": ["H_2D_LookMaster"],
  "dimension:3D": ["H-3d-LookMaster", "H_3d_ScaleNormalizer", "3D_AssetLibrary"],
  "modality:audio": ["game-audio", "bgm-lifecycle"],
  "modality:image": [],
  "art_style:pixel": ["2D_ai_pixel_generation"],
  "genre:tower-defense": ["towerdefense-tower"],
  "modality:sidescroller": ["2D_sidescroller_assets"],
  "modality:3d": ["H-3d-LookMaster", "H_3d_ScaleNormalizer", "3D_AssetLibrary"],
};

export function skillsForTrigger(trigger: string): string[] {
  return TRIGGER_SKILLS[trigger] ?? [];
}
