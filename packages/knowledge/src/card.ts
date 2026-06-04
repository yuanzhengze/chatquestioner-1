import { z } from "zod";

export const CardTypeSchema = z.enum([
  "reference-game",
  "mechanic",
  "emotion-anchor",
  "juice",
  "loop-pattern",
]);
export type CardType = z.infer<typeof CardTypeSchema>;

export const CardTagsSchema = z.object({
  genre: z.array(z.string()).default([]),
  mechanics: z.array(z.string()).default([]),
  modalities: z.array(z.string()).default([]),
  emotion: z.array(z.string()).default([]),
  artStyle: z.array(z.string()).default([]),
});
export type CardTags = z.infer<typeof CardTagsSchema>;

export const KnowledgeCardSchema = z.object({
  id: z.string(),
  type: CardTypeSchema,
  title: z.string(),
  body: z.string(),
  tags: CardTagsSchema,
  stageAffinity: z.array(z.number().int()),
  embedding: z.array(z.number()).optional(),
});
export type KnowledgeCard = z.infer<typeof KnowledgeCardSchema>;

export const KnowledgeIndexSchema = z.object({
  generatedAt: z.string(),
  model: z.string(),
  dim: z.number(),
  cards: z.array(KnowledgeCardSchema),
});
export type KnowledgeIndex = z.infer<typeof KnowledgeIndexSchema>;

/** 检索器返回给提示词的最小视图（剔除 tags/embedding 等内部字段）。 */
export interface RetrievedCard {
  title: string;
  body: string;
}
