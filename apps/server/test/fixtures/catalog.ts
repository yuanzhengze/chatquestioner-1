import type { CatalogIndex } from "@cq/resolver";

export function fixtureCatalog(): CatalogIndex {
  return {
    generatedAt: "2026-06-02T00:00:00.000Z",
    forgeaxRoot: "/fake/forgeax",
    templates: [
      {
        id: "basic/pixijs-2d", kind: "basic", desc: "2D 基础模板",
        dimension: "2D", engine: "pixijs", inferred: false, mobileSupport: true,
        intentTerms: [], signatureTerms: [],
      },
      {
        id: "match3-candy", kind: "gameplay", desc: "三消糖果",
        dimension: "2D", engine: "pixijs", inferred: false, mobileSupport: true,
        intentTerms: ["消除", "连连看"], signatureTerms: ["三消"],
      },
    ],
    skills: [],
    mcp: [{ server: "as-mate-tools", port: "15200" }],
  };
}
