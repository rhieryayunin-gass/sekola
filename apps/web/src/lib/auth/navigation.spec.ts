import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "./navigation";

describe("sanitizeNextPath", () => {
  it("keeps an internal path", () => {
    expect(sanitizeNextPath("/dashboard?tab=calendar")).toBe(
      "/dashboard?tab=calendar",
    );
  });

  it.each([undefined, null, "", "https://example.com", "//example.com"])(
    "rejects unsafe redirect value %s",
    (value) => {
      expect(sanitizeNextPath(value)).toBe("/dashboard");
    },
  );
});
