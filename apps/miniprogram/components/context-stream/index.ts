const { mdToHtml } = require("../../utils/md.js");
const { hasQuestionMark, splitQuestion } = require("../../utils/splitQuestion.js");
const { optionsOf, isDirectionAsk } = require("../../utils/messageOptions.js");

type Msg = {
  role?: string;
  content?: string;
  display?: string;
  options?: Array<{ id: string; label: string; detail: string }>;
  optionsLive?: boolean;
  pendingId?: string;
  tintAsk?: boolean;
  ghost?: boolean;
  appear?: boolean;
};

type Rect = { left: number; top: number; width: number; height: number; bottom: number } | null;

Component({
  properties: {
    messages: { type: Array, value: [] },
    busy: { type: Boolean, value: false },
    /** >= 0 时把选项块的高度就地压到这个 px 值；-1 是自然高度。 */
    optsFreeze: { type: Number, value: -1 },
    /** 压高度的同时把卡片反向平移这么多 px，让它们留在原位。 */
    optsShift: { type: Number, value: 0 },
    /** 选项撤场后接手它剩下的高度；-1 是不渲染。 */
    tailSpace: { type: Number, value: -1 },
    /** 非空时渲染量高探针，内容是即将发出的那句话。 */
    probeText: { type: String, value: "" },
  },
  data: {
    items: [] as Array<{
      key: number;
      user: boolean;
      text: string;
      html: string;
      leadHtml: string;
      question: string;
      tailHtml: string;
      dots: boolean;
      ghost: boolean;
      appear: boolean;
      slot: boolean;
    }>,
    opts: [] as Array<{ id: string; label: string; detail: string }>,
    optsLive: false,
    optsPending: "",
    scrollTop: 0,
    scrollAnim: false,
  },
  observers: {
    "messages, busy"(messages: Msg[], busy: boolean) {
      const list = messages || [];
      const lastIndex = list.length - 1;
      const picked = optionsOf(list);

      const items = list.map((m, index) => {
        const user = (m.role || "assistant") === "user";
        const raw = m.content || "";
        const streaming = Boolean(busy) && index === lastIndex && !user;
        const tint = !user && hasQuestionMark(raw) && (m.tintAsk === true || isDirectionAsk(m.options));

        let html = "";
        let leadHtml = "";
        let question = "";
        let tailHtml = "";
        if (!user && raw) {
          try {
            const split = tint ? splitQuestion(raw) : { lead: "", question: "", tail: "" };
            if (split.question) {
              leadHtml = split.lead ? mdToHtml(split.lead) : "";
              question = split.question;
              tailHtml = split.tail ? mdToHtml(split.tail) : "";
            } else {
              html = mdToHtml(raw);
            }
          } catch (_e) {
            html = "";
          }
        }

        return {
          key: index,
          user,
          text: user ? (m.display || raw) : "",
          html,
          leadHtml,
          question,
          tailHtml,
          dots: !user && !html && !question && (m.appear === true || streaming),
          ghost: user && m.ghost === true,
          appear: !user && m.appear === true,
          slot: user && m.ghost === true,
        };
      });

      const held =
        list.some((m) => m.ghost === true)
        || Number(this.data.optsFreeze) >= 0
        || Number(this.data.tailSpace) >= 0;
      this.setData(
        {
          items,
          opts: picked.options,
          optsLive: picked.live && !busy,
          optsPending: picked.pendingId,
        },
        () => {
          /** 变形和收起占位期间列表必须一动不动，贴底交给这一段结束后再补。 */
          if (held) return;
          this.stickBottom(!busy);
        },
      );
    },
  },
  methods: {
    applyScroll(next: number, animated: boolean) {
      const prev = Number(this.data.scrollTop) || 0;
      /** scroll-top 同值不生效，抖 0.5px 逼它重跑。 */
      const value = Math.abs(prev - next) < 0.5 ? next + 0.5 : next;
      this.setData({ scrollAnim: animated === true, scrollTop: value });
    },

    stickBottom(animated: boolean) {
      if (this._sticking) {
        this._stickAgain = true;
        if (animated) this._stickAnim = true;
        return;
      }
      this._sticking = true;
      this._stickAnim = animated === true;
      const q = this.createSelectorQuery();
      q.select(".stream").scrollOffset();
      q.select(".stream").boundingClientRect();
      q.select("#stream-end").boundingClientRect();
      q.exec((res: Array<{ scrollTop?: number; bottom?: number } | null>) => {
        this._sticking = false;
        const offset = res && res[0];
        const view = res && res[1];
        const end = res && res[2];
        if (offset && view && end) {
          const gap = Number(end.bottom) - Number(view.bottom);
          if (isFinite(gap) && gap > 2) {
            this.applyScroll(Math.max(0, (Number(offset.scrollTop) || 0) + gap + 12), this._stickAnim);
          }
        }
        if (this._stickAgain) {
          this._stickAgain = false;
          const again = this._stickAnim === true;
          this._stickAnim = false;
          this.stickBottom(again);
        }
      });
    },

    /** 量探针：插进去的用户气泡 + 「…」一共要占多高（含它们的下边距）。 */
    measureProbe(cb: (height: number) => void) {
      const q = this.createSelectorQuery();
      q.select("#probe-wrap").boundingClientRect();
      q.exec((res: Array<{ height?: number } | null>) => {
        const h = res && res[0] ? Number(res[0].height) : 0;
        cb(isFinite(h) && h > 0 ? h : 0);
      });
    },

    /** 量落点：真实用户气泡的位置和大小。 */
    measureSlot(cb: (rect: Rect) => void) {
      const q = this.createSelectorQuery();
      q.select("#user-slot").boundingClientRect();
      q.exec((res: Array<Rect>) => {
        const r = res && res[0];
        cb(r && Number(r.width) > 0 ? r : null);
      });
    },

    onPick(e: { currentTarget: { dataset: { id?: string } } }) {
      if (this._picked || this.data.busy || !this.data.optsLive || this.data.optsPending) return;
      const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || "");
      const opt = this.data.opts.find((o) => o.id === id);
      if (!opt) return;
      this._picked = true;
      const q = this.createSelectorQuery();
      q.select("#opt-" + id).boundingClientRect();
      q.select("#opts-box").boundingClientRect();
      q.exec((res: Array<Rect>) => {
        this._picked = false;
        this.triggerEvent("choose", {
          option: opt,
          from: res && res[0] ? res[0] : null,
          box: res && res[1] ? res[1] : null,
        });
      });
    },
  },
});
