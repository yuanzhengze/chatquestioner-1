import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { Drawer, type DrawerTarget } from "./Drawer";
import type { ArtifactCard, SessionSummary } from "./types";
import "./admin.css";

type Tab = "sessions" | "artifacts";

export function AdminApp() {
  const [tab, setTab] = useState<Tab>("sessions");
  const [drawer, setDrawer] = useState<DrawerTarget>(null);

  return (
    <div className="admin">
      <header className="admin-header">
        <h1>NewBee 后台</h1>
        <nav className="tabs">
          <button className={tab === "sessions" ? "tab active" : "tab"} onClick={() => setTab("sessions")}>
            会话
          </button>
          <button className={tab === "artifacts" ? "tab active" : "tab"} onClick={() => setTab("artifacts")}>
            产出物
          </button>
        </nav>
      </header>

      <main className="admin-main">
        {tab === "sessions" ? (
          <SessionsTable onOpen={(id) => setDrawer({ kind: "session", id })} />
        ) : (
          <ArtifactsGrid onOpen={(id) => setDrawer({ kind: "artifact", id })} />
        )}
      </main>

      <Drawer target={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

function SessionsTable({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<SessionSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    adminApi.listSessions().then(setRows).catch((e) => setErr(String(e.message ?? e)));
  }, []);

  if (err) return <p className="muted">加载失败：{err}</p>;
  if (!rows) return <p className="muted">加载中…</p>;
  if (rows.length === 0) return <p className="muted">暂无会话</p>;

  return (
    <table className="table">
      <thead>
        <tr>
          <th>标题</th>
          <th>阶段</th>
          <th>产物</th>
          <th>更新时间</th>
          <th>ID</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.id} className="row" onClick={() => onOpen(s.id)}>
            <td>{s.workingTitle || <span className="muted">未命名</span>}</td>
            <td>{s.stage}</td>
            <td>{s.artifactCount}</td>
            <td className="muted">{new Date(s.updatedAt).toLocaleString()}</td>
            <td className="mono muted">{s.id.slice(0, 8)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ArtifactsGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<ArtifactCard[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    adminApi.listArtifacts().then(setRows).catch((e) => setErr(String(e.message ?? e)));
  }, []);

  if (err) return <p className="muted">加载失败：{err}</p>;
  if (!rows) return <p className="muted">加载中…</p>;
  if (rows.length === 0) return <p className="muted">暂无产出物</p>;

  return (
    <div className="grid">
      {rows.map((a) => (
        <article key={a.id} className="card" onClick={() => onOpen(a.id)}>
          <div className="card-head">
            <h3>{a.card.title}</h3>
            <span className="ver">v{a.version}</span>
          </div>
          <p className="card-pitch">{a.card.pitch || "—"}</p>
          <div className="badges">
            {a.card.genre && <span className="badge">{a.card.genre}</span>}
            {a.card.dimension && <span className="badge">{a.card.dimension}</span>}
            {a.card.engine && <span className="badge">{a.card.engine}</span>}
            {a.card.hasRunnableDef && <span className="badge ok">可运行</span>}
          </div>
          {a.card.tags.length > 0 && (
            <div className="tags">
              {a.card.tags.slice(0, 6).map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="card-foot muted">
            MVP {a.card.mvpMustCount} 项 · 风险 {a.card.riskCount} 条
          </div>
        </article>
      ))}
    </div>
  );
}
