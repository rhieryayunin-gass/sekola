/** Bounded local parsers. Imported data stays in the browser until the explicit review/commit step. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  row.push(value);
  if (row.some(Boolean)) rows.push(row);
  if (rows.length > 501)
    throw new Error("Use at most 500 data rows per import");
  if (rows.some((r) => r.length > 100)) throw new Error("Maximum 100 columns");
  return rows.map((r) => r.map((v) => v.replace(/^\uFEFF/, "").trim()));
}
export async function parseSchoolFile(file: File): Promise<string[][]> {
  if (file.size > 5_000_000) throw new Error("Maximum file size is 5 MB");
  if (file.name.toLowerCase().endsWith(".csv"))
    return parseCsv(await file.text());
  if (!file.name.toLowerCase().endsWith(".xlsx"))
    throw new Error("Choose CSV or XLSX");
  const bytes = new Uint8Array(await file.arrayBuffer()),
    view = new DataView(bytes.buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("Invalid workbook");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true),
    expanded = 0;
  if (count > 2000) throw new Error("Workbook has too many entries");
  const entries = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (
      offset + 46 > bytes.length ||
      view.getUint32(offset, true) !== 0x02014b50
    )
      throw new Error("Invalid ZIP directory");
    const method = view.getUint16(offset + 10, true),
      size = view.getUint32(offset + 20, true),
      rawSize = view.getUint32(offset + 24, true),
      n = view.getUint16(offset + 28, true),
      extra = view.getUint16(offset + 30, true),
      comment = view.getUint16(offset + 32, true),
      local = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(
      bytes.slice(offset + 46, offset + 46 + n),
    );
    offset += 46 + n + extra + comment;
    if (!["xl/sharedStrings.xml", "xl/worksheets/sheet1.xml"].includes(name))
      continue;
    expanded += rawSize;
    if (expanded > 15_000_000 || size > 5_000_000 || local + 30 > bytes.length)
      throw new Error("Workbook expands beyond the import limit");
    const begin =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    if (begin + size > bytes.length) throw new Error("Truncated workbook");
    const data = bytes.slice(begin, begin + size);
    let out: Uint8Array;
    if (method === 0) out = data;
    else if (method === 8) {
      const reader = new Blob([data])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"))
        .getReader();
      const parts: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 15_000_000 || length > rawSize) {
          await reader.cancel();
          throw new Error("Invalid expanded workbook size");
        }
        parts.push(value);
      }
      out = new Uint8Array(length);
      let at = 0;
      for (const p of parts) {
        out.set(p, at);
        at += p.length;
      }
    } else throw new Error("Unsupported workbook compression");
    entries.set(name, out);
  }
  const xml = (name: string) => {
    const xml = new TextDecoder().decode(entries.get(name));
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
      throw new Error("Unsupported XML declaration");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror"))
      throw new Error("Invalid worksheet XML");
    return doc;
  };
  if (!entries.has("xl/worksheets/sheet1.xml"))
    throw new Error("Use the first worksheet for your import");
  const strings = entries.has("xl/sharedStrings.xml")
    ? Array.from(xml("xl/sharedStrings.xml").getElementsByTagName("si")).map(
        (e) =>
          Array.from(e.getElementsByTagName("t"))
            .map((t) => t.textContent ?? "")
            .join(""),
      )
    : [];
  const rows = Array.from(
    xml("xl/worksheets/sheet1.xml").getElementsByTagName("row"),
  )
    .map((r) => {
      const row: string[] = [];
      for (const c of Array.from(r.getElementsByTagName("c"))) {
        if (c.getElementsByTagName("f").length)
          throw new Error("Convert formulas to values before importing");
        const letters = c.getAttribute("r")?.match(/^[A-Z]+/)?.[0] ?? "A";
        let n = 0;
        for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
        if (n > 100) throw new Error("Maximum 100 columns");
        const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
        row[n - 1] =
          c.getAttribute("t") === "s"
            ? (strings[Number(v)] ?? "")
            : c.getAttribute("t") === "inlineStr"
              ? (c.textContent ?? "")
              : v;
      }
      return Array.from({ length: row.length }, (_, i) => row[i] ?? "");
    })
    .filter((r) => r.some(Boolean));
  if (rows.length > 501)
    throw new Error("Use at most 500 data rows per import");
  return rows;
}
