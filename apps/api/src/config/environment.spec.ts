import { describe, expect, it } from "vitest";
import {
  parseCorsOrigins,
  validateEnvironment,
} from "./environment";

const requiredEnvironment = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

describe("validateEnvironment", () => {
  it("applies safe development defaults", () => {
    const result = validateEnvironment(requiredEnvironment);

    expect(result.PORT).toBe(3001);
    expect(result.NODE_ENV).toBe("development");
    expect(result.CORS_ORIGINS).toBe("http://localhost:3000");
  });

  it("rejects missing Supabase credentials", () => {
    expect(() => validateEnvironment({})).toThrow(
      "SUPABASE_URL is required",
    );
  });

  it("rejects an invalid port", () => {
    expect(() =>
      validateEnvironment({
        ...requiredEnvironment,
        PORT: "invalid",
      }),
    ).toThrow("PORT must be an integer between 1 and 65535");
  });
});

describe("parseCorsOrigins", () => {
  it("normalizes a comma-separated allowlist", () => {
    expect(
      parseCorsOrigins("https://app.example.com, http://localhost:3000"),
    ).toEqual([
      "https://app.example.com",
      "http://localhost:3000",
    ]);
  });
});
