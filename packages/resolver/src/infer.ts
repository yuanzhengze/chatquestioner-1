import type { Dimension, Engine } from "@cq/dsl";

export interface InferredConstraints {
  dimension?: Dimension;
  engine?: Engine;
  inferred: boolean;
}

/**
 * 从模板 desc 文本推断 dimension/engine（真实 template.yml 不填 primary_constraints）。
 * 规则：单一明确信号才采纳；"engine-agnostic" 或同时出现 pixijs+threejs 视为无单一引擎信号。
 */
export function inferConstraints(desc: string): InferredConstraints {
  const text = desc.toLowerCase();

  const hasPixi = /pixi\.?js|pixijs/.test(text);
  const hasThree = /three\.?js|threejs/.test(text);
  const agnostic = /engine-agnostic|engine agnostic/.test(text);

  let engine: Engine | undefined;
  if (!agnostic && hasPixi && !hasThree) engine = "pixijs";
  else if (!agnostic && hasThree && !hasPixi) engine = "threejs";
  else if (/\bphaser\b/.test(text)) engine = "phaser";

  let dimension: Dimension | undefined;
  if (/\b3d\b/.test(text)) dimension = "3D";
  else if (/\b2d\b/.test(text)) dimension = "2D";
  // 引擎可反推维度
  if (!dimension && engine === "pixijs") dimension = "2D";
  if (!dimension && engine === "threejs") dimension = "3D";

  return { dimension, engine, inferred: true };
}
