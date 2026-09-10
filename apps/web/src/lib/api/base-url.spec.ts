import { describe, expect, it } from "vitest";
import { apiBaseUrl } from "./base-url";
describe("API deployment URL", () => {
  it("uses the Nest prefix when Vercel supplies only an origin", () => {
    expect(apiBaseUrl("https://api.osekola.com")).toBe("https://api.osekola.com/api/v1");
    expect(apiBaseUrl("https://api.osekola.com/")).toBe("https://api.osekola.com/api/v1");
  });
  it("preserves an explicitly configured API prefix", () => {
    expect(apiBaseUrl("http://localhost:3001/api/v1/")).toBe("http://localhost:3001/api/v1");
  });
});
