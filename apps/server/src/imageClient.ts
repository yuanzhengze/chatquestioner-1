export interface ImageBytes {
  bytes: Buffer;
  mime: "image/png" | "image/jpeg" | "image/webp";
}

export interface ImageGenerator {
  generate(prompt: string): Promise<ImageBytes>;
}

function guessMime(buf: Buffer): ImageBytes["mime"] {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 4 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return "image/webp";
  return "image/png";
}

export class OpenAiImageClient implements ImageGenerator {
  constructor(
    private readonly opts: { baseURL: string; apiKey: string; model: string; size: string },
  ) {}

  async generate(prompt: string): Promise<ImageBytes> {
    const body = {
      model: this.opts.model,
      prompt,
      n: 1,
      size: this.opts.size,
      response_format: "b64_json" as const,
    };
    let json = await this.post(body);
    if (!this.hasPayload(json)) {
      const { response_format: _omit, ...retry } = body;
      json = await this.post(retry);
    }
    const item = this.firstItem(json);
    if (item?.b64_json) {
      const bytes = Buffer.from(String(item.b64_json), "base64");
      if (!bytes.length) throw new Error("empty image");
      return { bytes, mime: guessMime(bytes) };
    }
    if (item?.url) {
      const img = await fetch(String(item.url));
      if (!img.ok) throw new Error(`download image ${img.status}`);
      const bytes = Buffer.from(await img.arrayBuffer());
      if (!bytes.length) throw new Error("empty image");
      return { bytes, mime: guessMime(bytes) };
    }
    throw new Error("image API returned no b64_json or url");
  }

  private hasPayload(json: unknown): boolean {
    return Boolean(this.firstItem(json)?.b64_json || this.firstItem(json)?.url);
  }

  private firstItem(json: unknown): { b64_json?: string; url?: string } | undefined {
    if (!json || typeof json !== "object") return undefined;
    const data = (json as { data?: unknown }).data;
    if (!Array.isArray(data) || !data[0] || typeof data[0] !== "object") return undefined;
    return data[0] as { b64_json?: string; url?: string };
  }

  private async post(body: Record<string, unknown>): Promise<unknown> {
    const base = this.opts.baseURL.replace(/\/+$/, "");
    const res = await fetch(`${base}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`image API ${res.status}: ${raw.slice(0, 240)}`);
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new Error("image API returned non-JSON");
    }
  }
}
