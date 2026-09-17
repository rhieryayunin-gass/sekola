// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { POST } from "./route";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../../../lib/supabase/server", () => ({
  createClient: async () => ({ rpc }),
}));
async function request(kind = "valid") {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = await pdf.save();
  const form = new FormData();
  for (const [k, v] of Object.entries({
    name: "Fixture",
    nik: "0000000000000008",
    phone: "62800000000",
    domicile: "Fixture City",
    occupation: "Teacher",
    school_count: "2",
    contacts: "Fixture teacher, Fixture school",
    photo_confirmed: "on",
    consent: "on",
  }))
    form.set(k, v);
  form.set(
    "cv",
    new File([kind === "invalid" ? "%PDF-invalid" : new Uint8Array(bytes)], "cv.pdf", {
      type: "application/pdf",
    }),
  );
  return new Request("https://osekola.com/api/partners/register", {
    method: "POST",
    headers: {
      origin:
        kind === "origin" ? "https://other.invalid" : "https://osekola.com",
    },
    body: form,
  });
}
beforeEach(() => rpc.mockReset());
describe("partner registration boundary", () => {
  it("rejects a cross-origin submission before persistence", async () => {
    expect((await POST(await request("origin"))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed PDF content even with a PDF signature", async () => {
    expect((await POST(await request("invalid"))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects oversized requests before parsing", async () => {
    expect(
      (
        await POST(
          new Request("https://osekola.com/api/partners/register", {
            method: "POST",
            headers: {
              origin: "https://osekola.com",
              "content-length": "2000000",
            },
          }),
        )
      ).status,
    ).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("stores a valid PDF and returns only the application receipt", async () => {
    rpc.mockResolvedValue({
      data: { id: "application", status: "NEW" },
      error: null,
    });
    const result = await POST(await request());
    expect(result.status).toBe(201);
    expect(await result.json()).toEqual({ id: "application", status: "NEW" });
    expect(rpc.mock.calls[0][1].payload).toMatchObject({
      consent: true,
      photo_confirmed: true,
    });
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
  it("does not disclose database errors or personal data", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "sensitive internal details" },
    });
    const result = await POST(await request());
    expect(result.status).toBe(400);
    expect(await result.text()).not.toContain("sensitive");
  });
});
