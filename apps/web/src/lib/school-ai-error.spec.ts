import { describe, expect, it } from "vitest";
import { GatewayAuthenticationError, GatewayRateLimitError, GatewayInvalidRequestError } from "@ai-sdk/gateway";
import { schoolAIError } from "./school-ai-error";
describe("School AI failure handling", () => {
 it("recognizes nested authentication failures without leaking provider details", () => {
  const error = new Error("private prompt", { cause: new GatewayAuthenticationError({ message: "Bearer secret-token", statusCode: 401 }) });
  const result = schoolAIError(error);
  expect(result.code).toBe("AI_AUTH_REQUIRED");
  expect(JSON.stringify(result)).not.toMatch(/secret-token|private prompt|Bearer/);
 });
 it("distinguishes budget, rate-limit and generation failures", () => {
  expect(schoolAIError(new GatewayInvalidRequestError({ statusCode: 402 })).code).toBe("AI_BUDGET_EXCEEDED");
  expect(schoolAIError(new GatewayRateLimitError()).code).toBe("AI_RATE_LIMITED");
  expect(schoolAIError(new Error("private lesson content"))).toMatchObject({ code: "AI_GENERATION_FAILED", status: null });
 });
});
