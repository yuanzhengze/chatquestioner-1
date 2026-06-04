import { useState } from "react";
import { useTypewriter } from "../hooks/useTypewriter.js";
import type { SynthesisPayload } from "../types.js";

interface Props {
  synthesis: SynthesisPayload;
  canExport: boolean;
  onExport: () => void;
}

/** 左侧成果：GDD（打字机加速显现，可点击跳过）。 */
export function GddPanel({ synthesis }: { synthesis: SynthesisPayload }) {
  const tw = useTypewriter(synthesis.gddMarkdown, 6); // 长文：加速
  return (
    <div className="result-panel" onClick={() => !tw.done && tw.skip()}>
      <div className="result-head gdd">📄 GDD · 游戏设计文档</div>
      <pre className="result-body">{tw.shown}{!tw.done && <i className="tw-caret" />}</pre>
    </div>
  );
}

/** 右侧成果：Resolution / DSL 分 Tab + 导出。 */
export function FinalPanel({ synthesis, canExport, onExport }: Props) {
  const [tab, setTab] = useState<"resolution" | "dsl">("resolution");
  const r = synthesis.resolution;
  return (
    <div className="result-panel">
      <div className="result-head final">📦 最终内容输出</div>
      <div className="result-tabs">
        <button className={tab === "resolution" ? "active" : ""} onClick={() => setTab("resolution")}>Resolution</button>
        <button className={tab === "dsl" ? "active" : ""} onClick={() => setTab("dsl")}>DSL</button>
      </div>
      <div className="result-body">
        {tab === "resolution" ? (
          <div className="res-block">
            <div><strong>主模板</strong> {r.template.primary}</div>
            <div><strong>Skills（{r.skills.length}）</strong>
              <ul>{r.skills.map((s) => <li key={s.id}>{s.id} · {s.layer}/{s.load}</li>)}</ul></div>
            <div><strong>MCP（{r.mcp.length}）</strong>
              <ul>{r.mcp.map((m) => <li key={m.server}>{m.server} · {m.layer}/{m.phase}</li>)}</ul></div>
            <div><strong>Packages（{r.packages.length}）</strong>
              <ul>{r.packages.map((p) => <li key={p.id}>{p.id}</li>)}</ul></div>
            {r.warnings.length > 0 && <div className="res-warn">⚠ {r.warnings.join("；")}</div>}
          </div>
        ) : (
          <pre className="dsl-json">{JSON.stringify(synthesis.dsl, null, 2)}</pre>
        )}
      </div>
      <button className="result-export" disabled={!canExport} onClick={onExport}>⬇ 导出 bundle</button>
    </div>
  );
}
