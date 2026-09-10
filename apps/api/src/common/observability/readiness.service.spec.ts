import { afterEach, describe, expect, it, vi } from "vitest";
import { SupabaseService } from "../supabase/supabase.service";
import { ReadinessService } from "./readiness.service";

function fixture(result: Promise<unknown>) {
  const abortSignal = vi.fn().mockReturnValue(result);
  const from = vi.fn().mockReturnValue({ select: () => ({ limit: () => ({ abortSignal }) }) });
  return { from, abortSignal, service: new ReadinessService({ getClient: () => ({ from }) } as unknown as SupabaseService) };
}

describe("readiness", () => {
  afterEach(() => vi.useRealTimers());
  it("coalesces in-flight probes and probes again after success", async () => {
    const { service, from } = fixture(Promise.resolve({ error: null }));
    const first = service.check();
    expect(service.check()).toBe(first);
    await expect(first).resolves.toEqual({ status: "ready" });
    await service.check();
    expect(from).toHaveBeenCalledTimes(2);
  });
  it("fails closed without leaking dependency errors", async () => {
    const { service } = fixture(Promise.resolve({ error: { message: "private database detail" } }));
    await expect(service.check()).rejects.toMatchObject({ status: 503, message: "Service is not ready" });
  });
  it("aborts a hung dependency within two seconds", async () => {
    vi.useFakeTimers();
    const { service, abortSignal } = fixture(new Promise(() => {}));
    const assertion = expect(service.check()).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
    expect(abortSignal.mock.calls[0][0].aborted).toBe(true);
  });
});
