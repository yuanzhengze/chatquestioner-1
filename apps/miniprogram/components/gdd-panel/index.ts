const { mdToHtml } = require("../../utils/md.js");

Component({
  properties: {
    markdown: { type: String, value: "" },
  },
  data: {
    html: "",
  },
  observers: {
    markdown(md: string) {
      this.setData({ html: md ? mdToHtml(md) : "" });
    },
  },
  methods: {
    onCopy() {
      const md = this.properties.markdown || "";
      if (!md) return;
      wx.setClipboardData({
        data: md,
        success() {
          wx.showToast({ title: "已复制 GDD", icon: "success" });
        },
      });
    },
  },
});
