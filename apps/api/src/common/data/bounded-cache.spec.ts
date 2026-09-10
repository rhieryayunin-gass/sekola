import { describe, expect, it, vi } from "vitest";
import { BoundedCache } from "./bounded-cache";

describe("Bounded read cache", () => {
  it("coalesces concurrent reads but separates tenant/user keys", async () => {
    const cache = new BoundedCache<number>(); const loader = vi.fn(async () => 7);
    expect(await Promise.all([cache.get("A:u1",loader),cache.get("A:u1",loader),cache.get("B:u1",loader)])).toEqual([7,7,7]);
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it("expires and evicts old entries", async () => {
    let now = 0; const cache = new BoundedCache<number>(10,1,()=>now); const loader = vi.fn(async () => now);
    await cache.get("a",loader); now=11; await cache.get("a",loader); await cache.get("b",loader); await cache.get("a",loader);
    expect(loader).toHaveBeenCalledTimes(4);
  });
  it("does not retain failures", async () => {
    const cache = new BoundedCache<number>();
    await expect(cache.get("a",async () => { throw new Error("offline"); })).rejects.toThrow();
    expect(await cache.get("a",async()=>1)).toBe(1);
  });
});
