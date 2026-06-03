import { useEffect, useRef, useState } from "react";
import type { UseSession } from "../hooks/useSession.js";
import { useAvatar } from "../avatar/useAvatar.js";
import { Avatar } from "../avatar/Avatar.js";
import { BubbleColumn } from "./BubbleColumn.js";
import { DetailsDrawer } from "./DetailsDrawer.js";

/** 舞台式布局：中央大主形象 + 两侧气泡（左 NewBee / 右用户）+ 居中输入框 + 详情侧抽屉。 */
export function Stage({ session }: { session: UseSession }) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const typing = focused && draft.trim().length > 0 && !session.busy;

  const { view, onEmoteEnded } = useAvatar(session, typing);

  // 收敛后自动弹抽屉，提示可导出。
  const seenSynthesis = useRef(false);
  useEffect(() => {
    if (session.synthesis && !seenSynthesis.current) {
      seenSynthesis.current = true;
      setDrawerOpen(true);
    }
  }, [session.synthesis]);

  const submit = () => {
    const t = draft.trim();
    if (!t || session.busy) return;
    void session.send(t);
    setDraft("");
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>NewBee · 游戏共创</h1>
        <div className="header-spacer" />
        {session.error && <span className="err">出错：{session.error}</span>}
        <button className="drawer-toggle" onClick={() => setDrawerOpen((o) => !o)}>
          已识别 ▸
        </button>
      </header>

      <main className="stage">
        <BubbleColumn side="left" role="assistant" messages={session.messages} busy={session.busy} />

        <div className="stage-center">
          <Avatar view={view} onEmoteEnded={onEmoteEnded} />
          <div className="composer">
            <textarea
              value={draft}
              placeholder="说说你的脑洞…（Enter 发送，Shift+Enter 换行）"
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <button disabled={session.busy} onClick={submit}>
              {session.busy ? "构思中…" : "发送"}
            </button>
          </div>
        </div>

        <BubbleColumn side="right" role="user" messages={session.messages} busy={session.busy} />
      </main>

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
