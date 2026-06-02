import type {
  GameDSL, ResolutionResult, ResolvedSkill, ResolvedMcp, ResolvedPackage,
} from "@cq/dsl";
import type { CatalogIndex, TemplateEntry } from "./catalog/types.js";
import { SKILL_RULES, L0_CORE_SKILLS, skillsForTrigger } from "./rules/skillRules.js";
import { MCP_RULES, mcpForModality } from "./rules/mcpRules.js";

export interface ResolveOptions {
  profile: string;
}

const FOUNDATION_PACKAGES = ["kubee-client-contract"];

/** 模板候选：硬门控 dimension+engine；mobile 时排除 mobile-support:false。 */
function candidateTemplates(dsl: GameDSL, catalog: CatalogIndex): TemplateEntry[] {
  const isMobile = dsl.constraints.platform.includes("mobile");
  return catalog.templates.filter((t) => {
    if (t.kind !== "gameplay") return false;
    if (t.dimension && t.dimension !== dsl.constraints.dimension) return false;
    if (t.engine && t.engine !== dsl.constraints.engine) return false;
    if (isMobile && !t.mobileSupport) return false;
    return true;
  });
}

/** intent/signature 词加权打分。 */
function scoreTemplate(dsl: GameDSL, t: TemplateEntry): { score: number; matched: string[] } {
  const terms = [...dsl.intent_terms, ...(dsl.genre ? [dsl.genre] : [])].map((x) => x.toLowerCase());
  const sig = dsl.signature_terms.map((x) => x.toLowerCase());
  const matched: string[] = [];
  let score = 0;
  for (const it of t.intentTerms) {
    if (terms.some((q) => it.toLowerCase().includes(q) || q.includes(it.toLowerCase()))) {
      score += 1; matched.push(it);
    }
  }
  for (const st of t.signatureTerms) {
    if (sig.some((q) => st.toLowerCase().includes(q) || q.includes(st.toLowerCase()))) {
      score += 2; matched.push(st);
    }
  }
  return { score, matched };
}

function basicFallbackId(dsl: GameDSL, catalog: CatalogIndex): string {
  // _cn 变体由接入层的 profile 决定；此处用通用 basic。
  const id = dsl.constraints.dimension === "3D" ? "basic/threejs-3d" : "basic/pixijs-2d";
  return catalog.templates.find((t) => t.id === id)?.id ?? id;
}

export function resolve(dsl: GameDSL, catalog: CatalogIndex, opts: ResolveOptions): ResolutionResult {
  const warnings: string[] = [];

  // ---- 模板 ----
  const candidates = candidateTemplates(dsl, catalog);
  const scored = candidates
    .map((t) => ({ t, ...scoreTemplate(dsl, t) }))
    .sort((a, b) => b.score - a.score);

  let primaryEntry: TemplateEntry | undefined;
  let matchedTerms: string[] = [];
  if (scored.length && scored[0].score > 0) {
    primaryEntry = scored[0].t;
    matchedTerms = scored[0].matched;
  } else {
    const fb = basicFallbackId(dsl, catalog);
    primaryEntry = catalog.templates.find((t) => t.id === fb);
    warnings.push(`no gameplay template matched; fell back to ${fb}`);
  }
  const primaryId = primaryEntry?.id ?? basicFallbackId(dsl, catalog);
  const references = scored.slice(1).filter((s) => s.score > 0).slice(0, 2).map((s) => s.t.id);

  // ---- unmatched（无损：记录没命中任何模板的自由 intent 词） ----
  const allTemplateTerms = new Set(
    candidates.flatMap((t) => [...t.intentTerms, ...t.signatureTerms]).map((x) => x.toLowerCase()),
  );
  const unmatched = dsl.intent_terms.filter(
    (q) => ![...allTemplateTerms].some((t) => t.includes(q.toLowerCase()) || q.toLowerCase().includes(t)),
  );

  // ---- skills ----
  const skillIds = new Set<string>();
  const skillTrigger = new Map<string, string>();
  for (const id of L0_CORE_SKILLS) {
    skillIds.add(id); skillTrigger.set(id, "core");
  }
  const dimTrigger = `dimension:${dsl.constraints.dimension}`;
  for (const id of skillsForTrigger(dimTrigger)) {
    skillIds.add(id); skillTrigger.set(id, dimTrigger);
  }
  for (const mod of dsl.modalities) {
    const trig = `modality:${mod}`;
    for (const id of skillsForTrigger(trig)) {
      skillIds.add(id); if (!skillTrigger.has(id)) skillTrigger.set(id, trig);
    }
  }
  if (dsl.art_style) {
    const trig = `art_style:${dsl.art_style}`;
    for (const id of skillsForTrigger(trig)) {
      skillIds.add(id); if (!skillTrigger.has(id)) skillTrigger.set(id, trig);
    }
  }
  if (dsl.genre) {
    const trig = `genre:${dsl.genre}`;
    for (const id of skillsForTrigger(trig)) {
      skillIds.add(id); if (!skillTrigger.has(id)) skillTrigger.set(id, trig);
    }
  }
  const skills: ResolvedSkill[] = [...skillIds]
    .filter((id) => id !== "pack-search")
    .map((id) => {
      const rule = SKILL_RULES[id];
      return {
        id,
        layer: rule?.layer ?? "L2",
        phase: rule?.phase ?? "production",
        load: rule?.defaultLoad ?? "gated",
        trigger: skillTrigger.get(id),
      };
    });

  // ---- mcp ----
  const mcpServers = new Set<string>();
  const mcpTrigger = new Map<string, string>();
  if (catalog.mcp.some((m) => m.server === "as-mate-tools")) {
    mcpServers.add("as-mate-tools"); mcpTrigger.set("as-mate-tools", "boot");
  }
  for (const mod of dsl.modalities) {
    for (const server of mcpForModality(mod)) {
      if (catalog.mcp.some((m) => m.server === server)) {
        mcpServers.add(server);
        if (!mcpTrigger.has(server)) mcpTrigger.set(server, `modality:${mod}`);
      }
    }
  }
  const mcp: ResolvedMcp[] = [...mcpServers].map((server) => {
    const rule = MCP_RULES[server];
    const r: ResolvedMcp = {
      server,
      layer: rule?.layer ?? "L2",
      phase: rule?.phase ?? "production",
      load: server === "as-mate-tools" ? "eager" : "gated",
      trigger: mcpTrigger.get(server),
    };
    if (server === "as-mate-tools") r.tools = ["install_packs", "workflow_step"];
    return r;
  });

  // ---- packages ----
  const packages: ResolvedPackage[] = FOUNDATION_PACKAGES.map((id) => ({
    id, load: "eager", trigger: "foundation",
  }));
  if (dsl.modalities.includes("audio")) {
    packages.push({ id: "bgm-lifecycle", load: "eager", trigger: "modality:audio" });
  }

  // ---- install_packs 投影 ----
  const install_packs = {
    primary_template: primaryId,
    reference_templates: references,
    package_ids: packages.map((p) => p.id),
  };

  return {
    schema_version: "0.2",
    profile: opts.profile,
    template: {
      primary: primaryId,
      references,
      basis: {
        matched_terms: matchedTerms,
        constraints: { dimension: dsl.constraints.dimension, engine: dsl.constraints.engine },
      },
    },
    skills,
    mcp,
    packages,
    unmatched,
    warnings,
    install_packs,
  };
}
