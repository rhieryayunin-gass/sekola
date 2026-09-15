import { describe, expect, it } from "vitest";
import { parseCsv, parseSchoolFile } from "./school-import";

// A minimal stored ZIP keeps workbook tests independent of a parser library.
function workbook(xml: string): File {
  const name = new TextEncoder().encode("xl/worksheets/sheet1.xml");
  const data = new TextEncoder().encode(xml);
  const local = new Uint8Array(30 + name.length + data.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint16(26, name.length, true);
  local.set(name, 30); local.set(data, 30 + name.length);
  const central = new Uint8Array(46 + name.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint32(20, data.length, true);
  cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
  central.set(name, 46);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(10, 1, true);
  ev.setUint32(16, local.length, true);
  const bytes = new Uint8Array(local.length + central.length + end.length);
  bytes.set(local); bytes.set(central, local.length); bytes.set(end, local.length + central.length);
  return { name: "school.xlsx", size: bytes.length, arrayBuffer: async () => bytes.buffer } as File;
}
describe("School migration parsing", () => {
  it("preserves quoted commas, escaped quotes and multiline cells", () => {
    expect(parseCsv('\uFEFFcode,name,notes\r\nA,"Class, A","Line 1\nLine ""2"""\r\n')).toEqual([
      ["code", "name", "notes"], ["A", "Class, A", 'Line 1\nLine "2"'],
    ]);
  });
  it("rejects malformed CSV and oversized row/column batches", () => {
    expect(() => parseCsv('a,"b')).toThrow("Unclosed");
    expect(() => parseCsv(Array(502).fill("a").join("\n"))).toThrow("500");
    expect(() => parseCsv(Array(101).fill("a").join(","))).toThrow("100 columns");
  });
  it("reads sparse first-sheet cells without shifting columns", async () => {
    expect(await parseSchoolFile(workbook('<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>code</t></is></c><c r="C1"><v>25</v></c></row></sheetData></worksheet>'))).toEqual([["code", "", "25"]]);
  });
  it("rejects formulas and XML entity declarations before importing", async () => {
    await expect(parseSchoolFile(workbook('<worksheet><row><c r="A1"><f>1+1</f><v>2</v></c></row></worksheet>'))).rejects.toThrow("formulas");
    await expect(parseSchoolFile(workbook('<!DOCTYPE x [<!ENTITY e "x">]><worksheet/>'))).rejects.toThrow("XML declaration");
  });
});
