const { mdToHtml } = require("../../utils/md.js");
const { splitQuestion, markedQuestion } = require("../../utils/splitQuestion.js");
const { optionsOf, shouldTintAsk, flyEase } = require("../../utils/messageOptions.js");

/** 流式跟上用的时长。和飞行同一条曲线，距离大就接近 320ms，一行字则短一些。不是瞬间改 scrollTop。 */
const FOLLOW_MIN = 160;
const FOLLOW_MAX = 320;
const CHAT_MD = { chat: true };

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
    optsEase: { type: Boolean, value: false },
    /** 收起这一帧才把下边距收到 0，和高度、滚动同一段。 */
    optsGone: { type: Boolean, value: false },
    /** 非空时渲染量高探针，内容是即将发出的那句话。 */
    probeText: { type: String, value: "" },
    /** 助手头像。由页面传入，以后换正式形象只改这里的来源。 */
    avatar: { type: String, value: "" },
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
      dim: boolean;
      appear: boolean;
      slot: boolean;
      owns: boolean;
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

        let html = "";
        let leadHtml = "";
        let question = "";
        let tailHtml = "";
        if (!user && raw) {
          try {
            const marked = markedQuestion(raw);
            const tint = shouldTintAsk(m, streaming);
            const split = marked.question ? marked : (tint ? splitQuestion(raw) : { lead: "", question: "", tail: "" });
            if (split.question) {
              leadHtml = split.lead ? mdToHtml(split.lead, CHAT_MD) : "";
              question = split.question;
              tailHtml = split.tail ? mdToHtml(split.tail, CHAT_MD) : "";
            } else {
              html = mdToHtml(raw, CHAT_MD);
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
          /** 还没轮到「…」显形：高度已经占住，只是看不见。 */
          dim: !user && m.ghost === true,
          appear: !user && m.appear === true && m.ghost !== true,
          slot: user && m.ghost === true,
          owns: index === picked.at,
        };
      });

      const freeze = Number(this.data.optsFreeze);
      const locked = this._scrollHold === true
        || list.some((m) => m.ghost === true)
        || (picked.options.length > 0 && freeze >= 0);
      this.setData(
        {
          items,
          opts: picked.options,
          optsLive: picked.live && !busy,
          optsPending: picked.pendingId,
        },
        () => {
          /**
           * 选项节点已经从这次 setData 里撤掉，高度锁还停在 0。
           * 通知页面放开锁。节点已经不在，放开不会把空壳弹回原高。
           */
          if (!picked.options.length && freeze >= 0) this.triggerEvent("optsclear");
          /**
           * locked 在 observer 当帧就定死。飞行、落位、thinking 显形这几下
           * 都不许再贴底；滚动只走 placeGhost 里那一条 scrollEase。
           */
          if (locked) return;
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
            const from = Math.max(0, Number(offset.scrollTop) || 0);
            if (this._stickAnim) {
              this.applyScroll(Math.max(0, from + gap + 12), true);
            } else {
              const dist = Math.max(0, gap);
              const ms = Math.min(FOLLOW_MAX, Math.max(FOLLOW_MIN, dist));
              this.scrollEase(from, from + dist, ms);
            }
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

    /** 飞行期间禁止 observer 再贴底。标志在 observer 当帧读取，之后放开也不会把这一下补回来。 */
    holdScroll() {
      this._scrollHold = true;
    },

    releaseScroll() {
      this._scrollHold = false;
    },

    /** 量落点：真实用户气泡、当前滚动，以及尾巴离可视区底边还有多远。 */
    measureLanding(cb: (out: {
      slot: Rect;
      scrollTop: number;
      tailGap: number;
      optsBottom: number | null;
    }) => void) {
      const q = this.createSelectorQuery();
      q.select("#user-slot").boundingClientRect();
      q.select(".stream").scrollOffset();
      q.select(".stream").boundingClientRect();
      q.select("#stream-end").boundingClientRect();
      q.select("#opts-box").boundingClientRect();
      q.exec((res: Array<Record<string, number> | null>) => {
        const slot = res && res[0];
        const offset = res && res[1];
        const view = res && res[2];
        const end = res && res[3];
        const opts = res && res[4];
        const viewBottom = view ? Number(view.bottom) : NaN;
        const endBottom = end ? Number(end.bottom) : NaN;
        const tailGap = isFinite(viewBottom) && isFinite(endBottom) ? endBottom - viewBottom : 0;
        const optsBottom = opts && isFinite(Number(opts.bottom)) ? Number(opts.bottom) : null;
        cb({
          slot: slot && Number(slot.width) > 0 ? (slot as unknown as Rect) : null,
          scrollTop: offset ? Number(offset.scrollTop) || 0 : 0,
          tailGap,
          optsBottom,
        });
      });
    },

    /** 停掉自管滚动，避免落地那一帧还有一步补上来把位置拽偏。 */
    stopEase() {
      this._easeGen = (Number(this._easeGen) || 0) + 1;
      if (this._easeTimer) clearTimeout(this._easeTimer);
      this._easeTimer = 0;
    },

    /**
     * 收选项块：从量到的 scrollTop 按飞行曲线滚到终点。
     * 必须和高度过渡同一帧开跑，不能再去量一次 —— 再量一次高度已经在缩，气泡会先跳。
     */
    scrollEase(from: number, to: number, ms: number) {
      this.stopEase();
      const token = this._easeGen;
      const start = Math.max(0, Number(from) || 0);
      const end = Math.max(0, Number(to) || 0);
      const dur = Math.max(1, Number(ms) || 1);
      const t0 = Date.now();
      const step = () => {
        if (this._easeGen !== token) return;
        const p = Math.min(1, (Date.now() - t0) / dur);
        const y = start + (end - start) * flyEase(p);
        this.setData({ scrollAnim: false, scrollTop: p < 1 ? y : end });
        if (p < 1) this._easeTimer = setTimeout(step, 16) as unknown as number;
        else this._easeTimer = 0;
      };
      step();
    },

    /** 落地时把终点按死。已经在终点就不动，避免同值抖动再把列表拽 0.5px。 */
    scrollTo(top: number, animated: boolean) {
      this.stopEase();
      const next = Math.max(0, Number(top) || 0);
      const prev = Number(this.data.scrollTop) || 0;
      if (!animated && Math.abs(prev - next) < 0.5) return;
      this.applyScroll(next, animated === true);
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
