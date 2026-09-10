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

  const production = { ...requiredEnvironment, NODE_ENV: "production", CORS_ORIGINS: "https://school.example.com", RELEASE_SHA: "a".repeat(40) };
  it("accepts explicit production configuration", () => {
    expect(validateEnvironment(production).NODE_ENV).toBe("production");
  });
  it.each([
    { CORS_ORIGINS: undefined }, { CORS_ORIGINS: "*" },
    { CORS_ORIGINS: "http://school.example.com" }, { CORS_ORIGINS: "https://localhost" },
    { CORS_ORIGINS: "https://school.example.com/path" }, { CORS_ORIGINS: "https://user:pass@school.example.com" },
    { SUPABASE_URL: "http://example.supabase.co" }, { RELEASE_SHA: undefined }, { RELEASE_SHA: "main" },
  ])("rejects unsafe/incomplete production configuration: %j", (override) => {
    expect(() => validateEnvironment({ ...production, ...override })).toThrow();
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
