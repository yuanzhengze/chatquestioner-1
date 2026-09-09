export interface KeywordPools {
  gameplay: string[];
  emotion: string[];
  world: string[];
  visual: string[];
  narrative: string[];
  motivation: string[];
}

export interface GddModel {
  title: string;
  pitch: string;
  coreFantasy: string;
  coreExperience: string;
  coreLoop: string[];
  keywordPools: KeywordPools;
  differentiator: string;
  references: { borrow: string[]; avoid: string[] };
  mvp: { must: string[]; cut: string[] };
  risks: string[];
  /** 游戏宪法：不可漂移项 */
  constitution: string[];
}

/**
 * GDD 是否已有实质内容，可以呈现给用户。
 *
 * 渲染出的 Markdown 恒有章节骨架，长度非空不代表有内容；这里只看创意维度的字段，
 * 不看工程信号（维度/引擎/平台）——那些属于下游 ForgeaX，不该成为出稿门槛。
 */
export function isSubstantive(m: GddModel): boolean {
  const filled = [m.pitch, m.coreFantasy, m.coreExperience, m.differentiator]
    .some((s) => s.trim().length > 0);
  const listed = m.coreLoop.length > 0 || m.mvp.must.length > 0 || m.constitution.length > 0;
  const pooled = Object.values(m.keywordPools).some((pool) => pool.length > 0);
  return filled || listed || pooled;
}
