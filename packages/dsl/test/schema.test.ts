import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { GameDslSchema, ResolutionResultSchema } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, "../schema");

function committed(name: string): unknown {
  return JSON.parse(readFileSync(resolve(schemaDir, name), "utf8"));
}

describe("JSON Schema 与 zod 同源（漂移守卫）", () => {
  it("game-dsl.schema.json 与 GameDslSchema 一致", () => {
    expect(committed("game-dsl.schema.json")).toEqual(zodToJsonSchema(GameDslSchema, "GameDSL"));
  });

  it("resolution-result.schema.json 与 ResolutionResultSchema 一致", () => {
    expect(committed("resolution-result.schema.json")).toEqual(
      zodToJsonSchema(ResolutionResultSchema, "ResolutionResult"),
    );
  });
});
