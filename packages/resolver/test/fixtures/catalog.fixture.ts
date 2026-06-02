import type { CatalogIndex } from "../../src/index.js";

export const fixtureCatalog: CatalogIndex = {
  generatedAt: "2026-06-02T00:00:00.000Z",
  forgeaxRoot: "/fake",
  templates: [
    {
      id: "match3-candy", kind: "gameplay", desc: "PixiJS 2D match-3 ...",
      dimension: "2D", engine: "pixijs", inferred: true, mobileSupport: false,
      intentTerms: ["match 3", "candy crush", "gem puzzle"],
      signatureTerms: ["swap-match-cascade game"],
    },
    {
      id: "link-match", kind: "gameplay", desc: "Engine-agnostic tile-matching ...",
      dimension: "2D", engine: "pixijs", inferred: true, mobileSupport: false,
      intentTerms: ["link game", "tile matching puzzle", "mahjong connect"],
      signatureTerms: ["path-connected pair elimination"],
    },
    {
      id: "tower-defense-3d", kind: "gameplay", desc: "A 3D tower defense ... Three.js ...",
      dimension: "3D", engine: "threejs", inferred: true, mobileSupport: true,
      intentTerms: ["tower defense", "wave defense"],
      signatureTerms: ["wave-based tower defense"],
    },
    {
      id: "basic/pixijs-2d", kind: "basic", desc: "pixijs 2D basic template",
      dimension: "2D", engine: "pixijs", inferred: false, mobileSupport: true,
      intentTerms: [], signatureTerms: [],
    },
    {
      id: "basic/threejs-3d", kind: "basic", desc: "threejs 3D basic template",
      dimension: "3D", engine: "threejs", inferred: false, mobileSupport: true,
      intentTerms: [], signatureTerms: [],
    },
  ],
  skills: [],
  mcp: [
    { server: "as-mate-tools", port: "15200" },
    { server: "image-gemini", port: "3100" },
    { server: "image-postprocess", port: "3104" },
    { server: "music-search", port: "3106" },
  ],
};
