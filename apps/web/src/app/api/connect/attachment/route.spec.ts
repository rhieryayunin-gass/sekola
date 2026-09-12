// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const { getUser, single, download } = vi.hoisted(() => ({ getUser: vi.fn(), single: vi.fn(), download: vi.fn() }));
vi.mock("../../../../lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser }, from: () => ({ select: () => ({ eq: () => ({ single }) }) }), storage: { from: () => ({ download }) } }) }));
import { GET } from "./route";
const request = (message = "f4000000-0000-4000-8000-000000000001") => new Request(`https://osekola.com/api/connect/attachment?message=${message}`);
beforeEach(() => { vi.clearAllMocks(); getUser.mockResolvedValue({ data: { user: { id: "reader" } } }); });
describe("O-Connect attachment delivery", () => {
  it("rejects unauthenticated requests and invalid message identifiers", async () => {
    expect((await GET(request("../private"))).status).toBe(400);
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(request())).status).toBe(401);
    expect(download).not.toHaveBeenCalled();
  });
  it("does not download files when membership RLS denies the message or it was deleted", async () => {
    single.mockResolvedValue({ error: new Error("RLS denied") });
    expect((await GET(request())).status).toBe(404);
    single.mockResolvedValue({ data: { attachment_path: "private/file", deleted_at: "2026-09-12" } });
    expect((await GET(request())).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });
  it("forces downloads and prevents shared caching or executable content", async () => {
    single.mockResolvedValue({ data: { attachment_path: "private/file", attachment_name: 'name"\r\nattack.txt', attachment_type: "text/plain", deleted_at: null } });
    download.mockResolvedValue({ data: new Blob(["content"]) });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(response.headers.get("content-disposition")).not.toMatch(/[\r\n]/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
