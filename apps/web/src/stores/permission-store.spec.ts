import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePermissionStore } from "./permission-store";
vi.mock("../lib/supabase/client", () => ({ createClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: "account-a" }, access_token: "test-token" } } }) } }) }));
describe("Permission account isolation", () => {
  beforeEach(() => { usePermissionStore.getState().reset(); vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001"); });
  it("does not restore an old permission response after logout", async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    const loading = usePermissionStore.getState().load();
    await Promise.resolve();
    usePermissionStore.getState().reset();
    resolve(new Response(JSON.stringify({ data: { userId: "account-a", permissions: [{ code: "admin" }], roles: [] } })));
    await loading;
    expect(usePermissionStore.getState().context).toBeNull();
  });
  it("fails closed when permission context cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await usePermissionStore.getState().load();
    expect(usePermissionStore.getState().has("admin")).toBe(false);
  });
});
