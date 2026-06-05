import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { loadRetriever } from "../src/knowledgeRetriever.js";

describe("loadRetriever graceful fallback", () => {
  it("returns undefined when the index file is missing", async () => {
    const r = await loadRetriever({ indexPath: resolve(tmpdir(), "nope-xyz-zzz", "knowledge-index.json"), topK: 3 });
    expect(r).toBeUndefined();
  });

  it("returns undefined when the index file is malformed", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "cq-kb-"));
    const p = resolve(dir, "knowledge-index.json");
    writeFileSync(p, "{ not valid json");
    const r = await loadRetriever({ indexPath: p, topK: 3 });
    expect(r).toBeUndefined();
  });
});
