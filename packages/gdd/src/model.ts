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
