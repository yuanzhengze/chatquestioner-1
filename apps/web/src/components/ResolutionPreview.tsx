import type { SynthesisPayload } from "../types.js";

interface Props {
  synthesis: SynthesisPayload | null;
  canExport: boolean;
  onExport: () => void;
}

export function ResolutionPreview({ synthesis, canExport, onExport }: Props) {
  return (
    <div className="resolution">
      <div className="resolution-head">
        <h3>精确选择预览</h3>
        <button disabled={!canExport} onClick={onExport}>导出 bundle</button>
      </div>
      {!synthesis && <p className="muted">聊到收敛后，这里会显示要做什么 + 精确取的 template/skill/mcp。</p>}
      {synthesis && (
        <div className="resolution-body">
          <div className="res-block">
            <strong>主模板</strong> {synthesis.resolution.template.primary}
            {synthesis.resolution.template.references.length > 0 && (
              <span className="muted">（参考：{synthesis.resolution.template.references.join(", ")}）</span>
            )}
          </div>
          <div className="res-block">
            <strong>Skills（{synthesis.resolution.skills.length}）</strong>
            <ul>{synthesis.resolution.skills.map((s) => <li key={s.id}>{s.id} · {s.layer}/{s.load}{s.trigger ? ` · ${s.trigger}` : ""}</li>)}</ul>
          </div>
          <div className="res-block">
            <strong>MCP（{synthesis.resolution.mcp.length}）</strong>
            <ul>{synthesis.resolution.mcp.map((m) => <li key={m.server}>{m.server} · {m.layer}/{m.phase}</li>)}</ul>
          </div>
          {synthesis.resolution.warnings.length > 0 && (
            <div className="res-warn">⚠ {synthesis.resolution.warnings.join("；")}</div>
          )}
          <details className="gdd-draft">
            <summary>GDD 草稿（Markdown）</summary>
            <pre>{synthesis.gddMarkdown}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
