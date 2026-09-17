// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const { getUser, rpc } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("../../../../lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}));
const request = () =>
  new Request(
    "https://osekola.com/api/partners/cv?id=12345678-1234-4234-8234-123456789012",
  );
beforeEach(() => {
  getUser.mockReset();
  rpc.mockReset();
});
it("rejects unauthenticated document access", async () => {
  getUser.mockResolvedValue({ data: { user: null } });
  expect((await GET(request())).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it("requires database Owner authorization even with a session", async () => {
  getUser.mockResolvedValue({ data: { user: { id: "staff" } } });
  rpc.mockResolvedValue({ error: { code: "42501" } });
  expect((await GET(request())).status).toBe(403);
});
it("forces a private download after Owner authorization", async () => {
  getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
  rpc.mockResolvedValue({
    data: {
      data: Buffer.from("%PDF-fixture").toString("base64"),
      name: "cv.pdf",
    },
  });
  const r = await GET(request());
  expect(r.status).toBe(200);
  expect(r.headers.get("content-disposition")).toContain("attachment");
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(r.headers.get("x-content-type-options")).toBe("nosniff");
});
