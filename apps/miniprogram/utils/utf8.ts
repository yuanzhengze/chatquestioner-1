/** 把 chunked SSE 的 ArrayBuffer 拼成完整 UTF-8 字符串，跨块截断的多字节先攒着。 */
export class Utf8StreamDecoder {
  private pending = new Uint8Array(0);

  push(chunk: ArrayBuffer): string {
    const bytes = new Uint8Array(chunk);
    const merged = new Uint8Array(this.pending.length + bytes.length);
    merged.set(this.pending);
    merged.set(bytes, this.pending.length);
    const cut = incompleteTail(merged);
    const complete = merged.subarray(0, merged.length - cut);
    this.pending = cut ? merged.subarray(merged.length - cut) : new Uint8Array(0);
    return decodeUtf8(complete);
  }
}

function incompleteTail(buf: Uint8Array): number {
  if (buf.length === 0) return 0;
  let i = buf.length - 1;
  let cont = 0;
  while (i >= 0 && (buf[i] & 0xc0) === 0x80) {
    cont++;
    i--;
  }
  if (i < 0) return buf.length;
  const lead = buf[i];
  let need = 1;
  if ((lead & 0x80) === 0) need = 1;
  else if ((lead & 0xe0) === 0xc0) need = 2;
  else if ((lead & 0xf0) === 0xe0) need = 3;
  else if ((lead & 0xf8) === 0xf0) need = 4;
  else return 0;
  const have = cont + 1;
  return have < need ? have : 0;
}

function decodeUtf8(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8").decode(bytes);
  }
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  try {
    return decodeURIComponent(escape(out));
  } catch {
    return out;
  }
}
