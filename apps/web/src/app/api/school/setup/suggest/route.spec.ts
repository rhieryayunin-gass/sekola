// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const { getClaims, rpc, generateText } = vi.hoisted(() => ({ getClaims: vi.fn(), rpc: vi.fn(), generateText: vi.fn() }));
vi.mock("../../../../../lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims }, rpc }) }));
vi.mock("ai", async importOriginal => ({ ...await importOriginal<typeof import("ai")>(), generateText, Output: { object: vi.fn() } }));
vi.mock("@ai-sdk/gateway", async importOriginal => ({ ...await importOriginal<typeof import("@ai-sdk/gateway")>(), gateway: vi.fn() }));
import { POST } from "./route";
const id = "00000000-0000-4000-8000-000000000001";
const request = (origin = "https://osekola.com") => new Request("https://osekola.com/api/school/setup/suggest", { method: "POST", headers: { origin }, body: JSON.stringify({ request_id: id, locale: "en-US" }) });
beforeEach(() => { vi.clearAllMocks(); getClaims.mockResolvedValue({ data: { claims: { sub: "staff" } } }); rpc.mockResolvedValue({ data: { context: { score: 20, checks: [] } } }); });
describe("Olla setup suggestions", () => {
  it("blocks cross-origin requests, unauthenticated users and denied reservations", async () => {
    expect((await POST(request("https://untrusted.invalid"))).status).toBe(403);
    expect(getClaims).not.toHaveBeenCalled();
    getClaims.mockResolvedValueOnce({ data: null });
    expect((await POST(request())).status).toBe(401);
    rpc.mockResolvedValueOnce({ error: { code: "42501", message: "Staff required" } });
    expect((await POST(request())).status).toBe(403);
    expect(generateText).not.toHaveBeenCalled();
  });
  it("persists the suggestion and token costs before returning its URL", async () => {
    const output = { summary: "Complete the year", steps: [] };
    generateText.mockResolvedValue({ output, totalUsage: { inputTokens: 100, outputTokens: 50 } });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).url).toBe(`/dashboard/core?suggestion=${id}`);
    expect(rpc).toHaveBeenLastCalledWith("school_setup_suggestion", expect.objectContaining({ action: "finish", request_id: id, payload: expect.objectContaining({ result: output, input_tokens: 100, output_tokens: 50, estimated_cost_usd: expect.any(Number) }) }));
    expect(rpc.mock.calls.at(-1)?.[1].payload.estimated_cost_usd).toBeCloseTo(0.00008, 9);
    expect(JSON.parse(generateText.mock.calls[0][0].prompt)).toEqual({ locale: "en-US", readiness: { score: 20, checks: [] } });
  });
  it("records provider failures and hides upstream details", async () => {
    generateText.mockRejectedValue(new Error("private upstream detail"));
    const response = await POST(request());
    expect(response.status).toBe(502); expect(await response.text()).not.toContain("private upstream detail");
    expect(rpc).toHaveBeenLastCalledWith("school_setup_suggestion", expect.objectContaining({ action: "finish", payload: expect.objectContaining({ result: null }) }));
  });
});
