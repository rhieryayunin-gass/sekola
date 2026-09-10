import { Controller, Get, Inject } from "@nestjs/common";
import { ReadinessService } from "./common/observability/readiness.service";

@Controller()
export class AppController {
  constructor(@Inject(ReadinessService) private readonly readiness: ReadinessService) {}
  @Get("ready")
  ready() { return this.readiness.check(); }
  @Get("health")
  health() {
    return {
      status: "ok",
      service: "sekola-api",
      version: "0.1.0",
      release: process.env.RELEASE_SHA ?? "development",
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
