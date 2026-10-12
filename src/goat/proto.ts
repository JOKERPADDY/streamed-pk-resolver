function varint(n: number): Uint8Array {
  const bytes: number[] = [];
  let v = n >>> 0;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return Uint8Array.from(bytes);
}

function fieldStr(field: number, value: string): Uint8Array {
  const body = new TextEncoder().encode(value);
  const tag = Uint8Array.of((field << 3) | 2);
  const len = varint(body.length);
  const out = new Uint8Array(tag.length + len.length + body.length);
  out.set(tag, 0);
  out.set(len, tag.length);
  out.set(body, tag.length + len.length);
  return out;
}

export function encodeFetchBody(source: string, id: string, stream: string): Uint8Array {
  const parts = [fieldStr(1, source), fieldStr(2, id), fieldStr(3, stream)];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}
