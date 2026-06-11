import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { JsonView } from "./JsonView";
import type { ArtifactDetail, SessionDetail } from "./types";

type DrawerTarget =
  | { kind: "session"; id: string }
  | { kind: "artifact"; id: string }
  | null;

export function Drawer({ target, onClose }: { target: DrawerTarget; onClose: () => void }) {
  if (!target) return null;
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="drawer-close" onClick={onClose}>
          ×
        </button>
        {target.kind === "session" ? (
          <SessionBody id={target.id} />
        ) : (
          <ArtifactBody id={target.id} />
        )}
      </aside>
    </div>
  );
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    setErr(null);
    fn()
      .then((d) => live && setData(d))
      .catch((e) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, err };
}

function SessionBody({ id }: { id: string }) {
  const { data, err } = useAsync<SessionDetail>(() => adminApi.sessionDetail(id), [id]);
  if (err) return <p className="muted">加载失败：{err}</p>;
  if (!data) return <p className="muted">加载中…</p>;
  const s = data.session;
  return (
    <div>
      <h2>{s.workingTitle || "未命名会话"}</h2>
      <p className="mono muted">{s.id}</p>
      <div className="badges">
        <span className="badge">阶段 {s.stage}</span>
        <span className="badge">产物 {data.artifacts.length}</span>
        <span className="badge">更新 {new Date(s.updatedAt).toLocaleString()}</span>
      </div>

      {data.artifacts.length > 0 && (
        <>
          <h3>产出物</h3>
          <ul className="art-list">
            {data.artifacts.map((a) => (
              <li key={a.id}>
                <strong>v{a.version}</strong> · {a.card.title}
                {a.card.hasRunnableDef && <span className="badge ok">可运行</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>会话状态（ConversationState）</h3>
      <JsonView data={s.state} collapsed />
    </div>
  );
}

function ArtifactBody({ id }: { id: string }) {
  const { data, err } = useAsync<ArtifactDetail>(() => adminApi.artifactDetail(id), [id]);
  if (err) return <p className="muted">加载失败：{err}</p>;
  if (!data) return <p className="muted">加载中…</p>;
  const c = data.cardSummary;
  return (
    <div>
      <h2>{c.title}</h2>
      <p className="muted">{c.pitch}</p>
      <div className="badges">
        <span className="badge">v{data.version}</span>
        {c.genre && <span className="badge">{c.genre}</span>}
        {c.dimension && <span className="badge">{c.dimension}</span>}
        {c.engine && <span className="badge">{c.engine}</span>}
        {c.hasRunnableDef && <span className="badge ok">可运行 GameDef</span>}
      </div>

      <h3>GDD</h3>
      <pre className="gdd-pre">{data.gddMarkdown}</pre>

      <h3>DSL</h3>
      <JsonView data={data.dsl} collapsed />
      <h3>Resolution</h3>
      <JsonView data={data.resolution} collapsed />
      {data.gamedef != null && (
        <>
          <h3>GameDef</h3>
          <JsonView data={data.gamedef} collapsed />
        </>
      )}
    </div>
  );
}

export type { DrawerTarget };
