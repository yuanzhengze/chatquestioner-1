// 前端镜像类型：刻意不直接 import 后端包，保持 admin 前端与后端解耦。
// 字段需与 @cq/store 的 CardSummary / Repository 返回保持一致。

export interface CardSummary {
  title: string;
  pitch: string;
  coreExperience: string;
  genre: string | null;
  dimension: string | null;
  engine: string | null;
  platforms: string[];
  coreLoop: string[];
  tags: string[];
  differentiator: string | null;
  mvpMustCount: number;
  hasRunnableDef: boolean;
  primaryTemplate: string | null;
  riskCount: number;
}

export interface ArtifactCard {
  id: string;
  sessionId: string;
  version: number;
  card: CardSummary;
  createdAt: string;
}

export interface SessionSummary {
  id: string;
  stage: number;
  workingTitle: string | null;
  createdAt: string;
  updatedAt: string;
  artifactCount: number;
}

export interface SessionDetail {
  session: {
    id: string;
    stage: number;
    workingTitle: string | null;
    state: unknown;
    createdAt: string;
    updatedAt: string;
  };
  artifacts: ArtifactCard[];
}

export interface ArtifactDetail {
  id: string;
  sessionId: string;
  version: number;
  cardSummary: CardSummary;
  gddMarkdown: string;
  dsl: unknown;
  resolution: unknown;
  gamedef: unknown | null;
  exportDir: string | null;
  createdAt: string;
}
