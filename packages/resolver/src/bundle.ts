import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GameDSL, ResolutionResult } from "@cq/dsl";

export interface Bundle {
  gddMarkdown: string;
  dsl: GameDSL;
  resolution: ResolutionResult;
}

/** 导出交接 bundle：{ gdd.md, dsl.json, resolution.json }。 */
export function writeBundle(dir: string, bundle: Bundle): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "gdd.md"), bundle.gddMarkdown);
  writeFileSync(resolve(dir, "dsl.json"), JSON.stringify(bundle.dsl, null, 2) + "\n");
  writeFileSync(resolve(dir, "resolution.json"), JSON.stringify(bundle.resolution, null, 2) + "\n");
}
