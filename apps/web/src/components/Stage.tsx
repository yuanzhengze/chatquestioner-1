import { useEffect, useState } from "react";
import type { UseSession } from "../hooks/useSession.js";
import type { TurnOption } from "../types.js";
import { useAvatar } from "../avatar/useAvatar.js";
import { Avatar } from "../avatar/Avatar.js";
import { ContextStream } from "./ContextStream.js";
import { OptionBubble } from "./OptionBubble.js";
import { GddPanel, FinalPanel } from "./ResultPanel.js";
import { DetailsDrawer } from "./DetailsDrawer.js";

/** 三段式：顶部上下文流 + 中部形象（左右选项气泡 / 结束态成果面板）+ 底部输入。 */
export function Stage({ session }: { session: UseSession }) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const typing = focused && draft.trim().length > 0 && !session.busy;

  const { view, onEmoteEnded } = useAvatar(session, typing);

  const ended = session.stage?.readyForSynthesis === true && !!session.synthesis;

  // 新一轮（options 变化）清掉上一轮的待选高亮。
  useEffect(() => { setPendingId(null); }, [session.options]);

  const submit = () => {
    const t = draft.trim();
    if (!t || session.busy) return;
    void session.send(t);
    setDraft("");
  };

  // 点击选项：先播放选中/淡出动画，再发送。
  const choose = (opt: TurnOption) => {
    if (session.busy || pendingId) return;
    setPendingId(opt.id);
    window.setTimeout(() => void session.chooseOption(opt), 260);
  };

  const phaseOf = (id: string): "chosen" | "dismissed" | undefined =>
    pendingId == null ? undefined : id === pendingId ? "chosen" : "dismissed";

  const opts = session.options;
  const optA = opts?.find((o) => o.id === "A") ?? opts?.[0];
  const optB = opts?.find((o) => o.id === "B") ?? opts?.[1];

  return (
    <div className="app">
      <header className="app-header">
        <h1>NewBee · 游戏共创</h1>
        <div className="header-spacer" />
        {session.error && <span className="err">出错：{session.error}</span>}
        <button className="drawer-toggle" onClick={() => setDrawerOpen((o) => !o)}>已识别 ▸</button>
      </header>

      <section className="top-stream">
        <ContextStream messages={session.messages} busy={session.busy} />
      </section>

      <main className="stage">
        <div className="stage-side stage-left">
          {ended && session.synthesis
            ? <GddPanel synthesis={session.synthesis} />
            : optA && (
              <OptionBubble option={optA} side="left" phase={phaseOf(optA.id)} disabled={session.busy} onChoose={choose} />
            )}
        </div>

        <div className="stage-center">
          <Avatar view={view} onEmoteEnded={onEmoteEnded} />
        </div>

        <div className="stage-side stage-right">
          {ended && session.synthesis
            ? <FinalPanel synthesis={session.synthesis} canExport onExport={session.doExport} />
            : optB && (
              <OptionBubble option={optB} side="right" phase={phaseOf(optB.id)} disabled={session.busy} onChoose={choose} />
            )}
        </div>
      </main>

      {!ended && (
        <footer className="composer">
          <textarea
            value={draft}
            placeholder="说说你的脑洞…（Enter 发送，Shift+Enter 换行）"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          />
          <button disabled={session.busy} onClick={submit}>{session.busy ? "构思中…" : "发送"}</button>
        </footer>
      )}
      {ended && <footer className="composer composer-done">🎉 对话已完成，游戏概念已成型。</footer>}

      <DetailsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        state={session.state}
        stage={session.stage}
        synthesis={session.synthesis}
        canExport={Boolean(session.synthesis)}
        onExport={session.doExport}
      />
    </div>
  );
}
