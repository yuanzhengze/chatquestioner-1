import type { Dimension, Engine } from "@cq/dsl";

export interface TemplateEntry {
  id: string;
  kind: "gameplay" | "basic";
  desc: string;
  dimension?: Dimension;
  engine?: Engine;
  inferred: boolean;
  mobileSupport: boolean;
  intentTerms: string[];
  signatureTerms: string[];
}

export interface SkillEntry {
  name: string;
  description: string;
  tags: string[];
  source: string; // 相对 forgeax 的路径
}

export interface McpEntry {
  server: string;
  port?: string;
}

export interface CatalogIndex {
  generatedAt: string;
  forgeaxRoot: string;
  templates: TemplateEntry[];
  skills: SkillEntry[];
  mcp: McpEntry[];
}
