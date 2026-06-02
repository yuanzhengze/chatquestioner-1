import { describe, it, expect } from "vitest";
import { normalizeVocabField } from "../src/index.js";
import { GENRES } from "../src/vocab/genre.js";

describe("normalizeVocabField (enum + free-word fallback, D7)", () => {
  it("keeps an exact enum match as known", () => {
    const r = normalizeVocabField("Match-3", GENRES);
    expect(r).toEqual({ known: "match-3", fallback: [] });
  });

  it("falls a free word back into fallback[] (never dropped)", () => {
    const r = normalizeVocabField("拆家解压", GENRES);
    expect(r.known).toBeUndefined();
    expect(r.fallback).toEqual(["拆家解压"]);
  });

  it("trims and lowercases before matching", () => {
    const r = normalizeVocabField("  TOWER-DEFENSE ", GENRES);
    expect(r.known).toBe("tower-defense");
  });

  it("does not emit a blank fallback for whitespace-only input", () => {
    const r = normalizeVocabField("   ", GENRES);
    expect(r.known).toBeUndefined();
    expect(r.fallback).toEqual([]);
  });
});
