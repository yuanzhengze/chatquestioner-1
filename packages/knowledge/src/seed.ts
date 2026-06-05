import type { CatalogIndex } from "@cq/resolver";
import type { KnowledgeCard } from "./card.js";

/** catalog 的 gameplay 模板 → reference-game 卡（basic 模板跳过）。 */
export function seedCards(catalog: CatalogIndex): KnowledgeCard[] {
  return catalog.templates
    .filter((t) => t.kind === "gameplay")
    .map((t) => ({
      id: `ref-tpl-${t.id}`,
      type: "reference-game" as const,
      title: t.id,
      body: t.desc,
      tags: {
        genre: [],
        mechanics: [...t.intentTerms, ...t.signatureTerms],
        modalities: [],
        emotion: [],
        artStyle: [],
      },
      stageAffinity: [1, 2, 3],
    }));
}
