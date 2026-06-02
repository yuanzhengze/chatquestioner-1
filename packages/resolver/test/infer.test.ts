import { describe, it, expect } from "vitest";
import { inferConstraints } from "../src/index.js";

describe("inferConstraints (from template.yml desc)", () => {
  it("infers PixiJS 2D from a match-3 desc", () => {
    const r = inferConstraints("PixiJS 2D match-3 puzzle game template ...");
    expect(r).toEqual({ dimension: "2D", engine: "pixijs", inferred: true });
  });

  it("infers Three.js 3D from a tower defense desc", () => {
    const r = inferConstraints("A 3D tower defense game built with Three.js where players ...");
    expect(r).toEqual({ dimension: "3D", engine: "threejs", inferred: true });
  });

  it("returns undefined fields when desc gives no signal", () => {
    const r = inferConstraints("Engine-agnostic tile-matching elimination puzzle game");
    // engine-agnostic / no 2D|3D|pixijs|threejs keyword
    expect(r.engine).toBeUndefined();
  });
});
