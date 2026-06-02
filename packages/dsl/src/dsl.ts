import { z } from "zod";

export const PlatformSchema = z.enum(["PC", "mobile", "web"]);
export const DimensionSchema = z.enum(["2D", "3D"]);
export const EngineSchema = z.enum(["pixijs", "threejs", "phaser", "canvas", "dom"]);
export const NetworkingSchema = z.enum(["singleplayer", "multiplayer"]);
export const OrientationSchema = z.enum(["Landscape", "Portrait"]);
export const ModalitySchema = z.enum([
  "image", "audio", "ui", "3d", "pixel", "sidescroller", "narrative", "video",
]);

export const ConstraintsSchema = z.object({
  platform: z.array(PlatformSchema).min(1),
  dimension: DimensionSchema,
  engine: EngineSchema,
  networking: NetworkingSchema.default("singleplayer"),
  orientation: OrientationSchema.optional(),
});

export const GameDslSchema = z.object({
  schema_version: z.string(),
  constraints: ConstraintsSchema,
  genre: z.string().optional(),
  mechanics: z.array(z.string()).default([]),
  art_style: z.string().optional(),
  modalities: z.array(ModalitySchema).default([]),
  intent_terms: z.array(z.string()).default([]),
  signature_terms: z.array(z.string()).default([]),
  mvp_scope: z
    .object({ must: z.array(z.string()).default([]), cut: z.array(z.string()).default([]) })
    .default({ must: [], cut: [] }),
  constitution_ref: z.string().optional(),
});

export type Platform = z.infer<typeof PlatformSchema>;
export type Dimension = z.infer<typeof DimensionSchema>;
export type Engine = z.infer<typeof EngineSchema>;
export type Modality = z.infer<typeof ModalitySchema>;
export type Constraints = z.infer<typeof ConstraintsSchema>;
export type GameDSL = z.infer<typeof GameDslSchema>;
