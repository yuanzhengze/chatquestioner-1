import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const {
  sanitizeExportBase,
  gddExportFileName,
  joinUserDataPath,
  isShareCancel,
  shareGddMarkdown,
  sendGddFile,
} = createRequire(import.meta.url)("../utils/gddExport.js") as {
  sanitizeExportBase: (title: unknown) => string;
  gddExportFileName: (title: unknown, ext?: string) => string;
  joinUserDataPath: (root: string, name: string) => string;
  isShareCancel: (err: unknown) => boolean;
  shareGddMarkdown: (opts: {
    title?: unknown;
    markdown: string;
    userDataPath: string;
    writeFileSync: (path: string, data: string, encoding: string) => void;
    shareFileMessage: (opts: {
      filePath: string;
      fileName: string;
      success: () => void;
      fail: (err: unknown) => void;
    }) => void;
    onFail?: () => void;
    onUnsupported?: () => void;
  }) => { ok: boolean; reason?: string; fileName?: string };
  sendGddFile: (title: unknown, markdown: unknown) => { ok: boolean; reason?: string };
};

describe("gddExport 文件名", () => {
  it("空标题用未命名游戏", () => {
    expect(sanitizeExportBase("")).toBe("未命名游戏");
    expect(gddExportFileName("  ", "md")).toBe("未命名游戏-gdd.md");
  });

  it("去掉 Windows / 微信不让用的符号", () => {
    expect(gddExportFileName('旧村/新炊:*?"<>|', "md")).toBe("旧村新炊-gdd.md");
  });

  it("正常中文名加 -gdd 后缀", () => {
    expect(gddExportFileName("旧村新炊", "md")).toBe("旧村新炊-gdd.md");
    expect(gddExportFileName("旧村新炊", "txt")).toBe("旧村新炊-gdd.txt");
  });

  it("拼在 USER_DATA_PATH 下", () => {
    expect(joinUserDataPath("http://usr/", "a-gdd.md")).toBe("http://usr/a-gdd.md");
  });
});

describe("shareGddMarkdown", () => {
  it("没有正文就不写文件", () => {
    let wrote = false;
    const result = shareGddMarkdown({
      title: "x",
      markdown: "  ",
      userDataPath: "/usr",
      writeFileSync: () => {
        wrote = true;
      },
      shareFileMessage: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("empty");
    expect(wrote).toBe(false);
  });

  it(".md 被拒则同一拍改发 .txt，内容仍是 Markdown", () => {
    const writes: Array<{ path: string; data: string }> = [];
    const shares: string[] = [];
    const result = shareGddMarkdown({
      title: "旧村新炊",
      markdown: "# GDD",
      userDataPath: "/usr",
      writeFileSync: (path, data) => {
        writes.push({ path, data });
      },
      shareFileMessage: (opts) => {
        shares.push(opts.fileName);
        if (opts.fileName.endsWith(".md")) {
          opts.fail({ errMsg: "shareFileMessage:fail invalid file type" });
        } else {
          opts.success();
        }
      },
      onFail: () => {
        throw new Error("should not toast");
      },
    });
    expect(result.ok).toBe(true);
    expect(writes.map((w) => w.path)).toEqual(["/usr/旧村新炊-gdd.md", "/usr/旧村新炊-gdd.txt"]);
    expect(writes.every((w) => w.data === "# GDD")).toBe(true);
    expect(shares).toEqual(["旧村新炊-gdd.md", "旧村新炊-gdd.txt"]);
  });

  it("用户取消发送不改发 txt、不报失败", () => {
    const shares: string[] = [];
    let failed = false;
    shareGddMarkdown({
      title: "旧村新炊",
      markdown: "# GDD",
      userDataPath: "/usr",
      writeFileSync: () => {},
      shareFileMessage: (opts) => {
        shares.push(opts.fileName);
        opts.fail({ errMsg: "shareFileMessage:fail cancel" });
      },
      onFail: () => {
        failed = true;
      },
    });
    expect(isShareCancel({ errMsg: "shareFileMessage:fail cancel" })).toBe(true);
    expect(shares).toEqual(["旧村新炊-gdd.md"]);
    expect(failed).toBe(false);
  });

  it("开发者工具不支持时不改发 txt，走 onUnsupported", () => {
    const shares: string[] = [];
    let unsupported = false;
    let failed = false;
    shareGddMarkdown({
      title: "旧村新炊",
      markdown: "# GDD",
      userDataPath: "/usr",
      writeFileSync: () => {},
      shareFileMessage: (opts) => {
        shares.push(opts.fileName);
        opts.fail({ errMsg: "shareFileMessage:fail 开发者工具暂时不支持此 API 调试" });
      },
      onFail: () => {
        failed = true;
      },
      onUnsupported: () => {
        unsupported = true;
      },
    });
    expect(shares).toEqual(["旧村新炊-gdd.md"]);
    expect(unsupported).toBe(true);
    expect(failed).toBe(false);
  });

  it("写入失败走 onFail", () => {
    let failed = false;
    const result = shareGddMarkdown({
      title: "x",
      markdown: "# GDD",
      userDataPath: "/usr",
      writeFileSync: () => {
        throw new Error("disk");
      },
      shareFileMessage: () => {},
      onFail: () => {
        failed = true;
      },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("write");
    expect(failed).toBe(true);
  });

  it("共创页和文档页调用的发送函数确实是函数", () => {
    expect(typeof sendGddFile).toBe("function");
  });
});
