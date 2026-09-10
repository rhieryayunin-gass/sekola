import "reflect-metadata";
import { Body, ConsoleLogger, Controller, Get, INestApplication, Post, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppController } from "../../app.controller";
import { configureApp } from "../../configure-app";
import { ReadinessService } from "./readiness.service";

@Controller("fixture")
class FixtureController {
  @Get("failure") failure() { throw new Error("private-secret-value"); }
  @Post("body") body(@Body() body: unknown) { return body; }
}

describe("HTTP production boundary", () => {
  let app: INestApplication;
  let origin: string;
  const check = vi.fn();
  const events: unknown[] = [];
  beforeAll(async () => {
    for (const method of ["log", "warn", "error"] as const) vi.spyOn(ConsoleLogger.prototype, method).mockImplementation((event: unknown) => { events.push(event); });
    const module = await Test.createTestingModule({
      controllers: [AppController, FixtureController],
      providers: [
        { provide: ConfigService, useValue: new ConfigService({ CORS_ORIGINS: "https://school.example.com" }) },
        { provide: ReadinessService, useValue: { check } },
      ],
    }).compile();
    app = module.createNestApplication({ bodyParser: false, logger: false });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    origin = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); vi.restoreAllMocks(); });

  it("keeps liveness independent of database readiness and disables caching", async () => {
    check.mockRejectedValue(new ServiceUnavailableException("Service is not ready"));
    const live = await fetch(`${origin}/api/v1/health`);
    expect(live.status).toBe(200);
    expect(live.headers.get("cache-control")).toBe("no-store");
    expect(live.headers.has("x-powered-by")).toBe(false);
    expect((await live.json()).data.service).toBe("sekola-api");
    expect((await fetch(`${origin}/api/v1/ready`)).status).toBe(503);
    check.mockResolvedValue({ status: "ready" });
    expect((await fetch(`${origin}/api/v1/ready`)).status).toBe(200);
  });

  it("redacts errors, URLs, cookies and tokens while preserving correlation", async () => {
    const requestId = "7cfc99d0-b960-4e2b-954f-18d459b232ca";
    const response = await fetch(`${origin}/api/v1/fixture/failure?token=private-secret-value`, {
      headers: { "x-request-id": requestId, authorization: "Bearer private-secret-value", cookie: "session=private-secret-value" },
    });
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.requestId).toBe(requestId);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(body.error.message).toBe("Internal server error");
    expect(events).toContainEqual(expect.objectContaining({ event: "http_request", requestId, statusCode: 500, route: "/api/v1/fixture/failure" }));
    expect(JSON.stringify([body, events])).not.toContain("private-secret-value");
  });

  it("rejects malformed and oversized bodies without echoing input", async () => {
    for (const [body, status] of [["{private-secret-value", 400], [JSON.stringify({ value: "x".repeat(1024 * 1024) }), 413]] as const) {
      const response = await fetch(`${origin}/api/v1/fixture/body`, { method: "POST", headers: { "content-type": "application/json" }, body });
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain("private-secret-value");
    }
  });

  it("allows only configured browser origins", async () => {
    const allowed = await fetch(`${origin}/api/v1/health`, { headers: { origin: "https://school.example.com" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://school.example.com");
    const denied = await fetch(`${origin}/api/v1/health`, { headers: { origin: "https://outside.example.com", "x-request-id": "unsafe-value" } });
    expect(denied.headers.has("access-control-allow-origin")).toBe(false);
    expect(denied.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
  });
});
