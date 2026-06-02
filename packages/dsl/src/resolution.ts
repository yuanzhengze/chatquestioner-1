import { z } from "zod";

export const SkillLayerSchema = z.enum(["L0", "L1", "L2", "L3"]);
export const McpLayerSchema = z.enum(["L0", "L1", "L2", "L3", "L4", "L5"]);
export const PhaseSchema = z.enum(["boot", "production", "coding"]);
export const LoadModeSchema = z.enum(["eager", "gated", "lazy"]);

export const ResolvedSkillSchema = z.object({
  id: z.string(),
  layer: SkillLayerSchema,
  phase: PhaseSchema,
  load: LoadModeSchema,
  trigger: z.string().optional(),
});

export const ResolvedMcpSchema = z.object({
  server: z.string(),
  layer: McpLayerSchema,
  phase: PhaseSchema,
  load: LoadModeSchema,
  trigger: z.string().optional(),
  tools: z.array(z.string()).optional(),
});

export const ResolvedPackageSchema = z.object({
  id: z.string(),
  load: LoadModeSchema,
  trigger: z.string().optional(),
});

export const TemplateResolutionSchema = z.object({
  primary: z.string(),
  references: z.array(z.string()).default([]),
  basis: z.object({
    matched_terms: z.array(z.string()).default([]),
    constraints: z.object({
      dimension: z.enum(["2D", "3D"]),
      engine: z.string(),
    }),
  }),
});

export const InstallPacksProjectionSchema = z.object({
  primary_template: z.string(),
  reference_templates: z.array(z.string()).default([]),
  package_ids: z.array(z.string()).default([]),
});

export const ResolutionResultSchema = z.object({
  schema_version: z.literal("0.2"),
  profile: z.string(),
  template: TemplateResolutionSchema,
  skills: z.array(ResolvedSkillSchema).default([]),
  mcp: z.array(ResolvedMcpSchema).default([]),
  packages: z.array(ResolvedPackageSchema).default([]),
  unmatched: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  install_packs: InstallPacksProjectionSchema,
});

export type SkillLayer = z.infer<typeof SkillLayerSchema>;
export type McpLayer = z.infer<typeof McpLayerSchema>;
export type Phase = z.infer<typeof PhaseSchema>;
export type LoadMode = z.infer<typeof LoadModeSchema>;
export type ResolvedSkill = z.infer<typeof ResolvedSkillSchema>;
export type ResolvedMcp = z.infer<typeof ResolvedMcpSchema>;
export type ResolvedPackage = z.infer<typeof ResolvedPackageSchema>;
export type TemplateResolution = z.infer<typeof TemplateResolutionSchema>;
export type ResolutionResult = z.infer<typeof ResolutionResultSchema>;
