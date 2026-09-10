const { mdToHtml } = require("../../utils/md.js");

Component({
  properties: {
    messages: { type: Array, value: [] },
    busy: { type: Boolean, value: false },
  },
  data: {
    items: [] as Array<{
      role: string;
      who: string;
      content: string;
      html: string;
    }>,
  },
  observers: {
    "messages, busy"(messages: Array<{ role?: string; content?: string }>, busy: boolean) {
      const list = messages || [];
      const lastIndex = Math.max(0, list.length - 1);
      const items = list.map((m, index) => {
        const role = m.role || "assistant";
        const raw = m.content || "";
        const user = role === "user";
        let html = "";
        if (!user && raw) {
          try {
            html = mdToHtml(raw);
          } catch (_e) {
            html = "";
          }
        }
        let content = "";
        if (user) content = raw;
        else if (!html) content = busy && index === lastIndex ? "…" : "";
        return {
          role,
          who: user ? "你" : "NewBee",
          content,
          html,
        };
      });
      this.setData({ items });
    },
  },
});
