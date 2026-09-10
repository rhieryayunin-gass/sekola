import { randomUUID } from "node:crypto";
import { ConsoleLogger } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

const logger = new ConsoleLogger("HTTP", { json: true });
export function httpLogging(request: Request, response: Response, next: NextFunction) {
  const incoming = request.headers["x-request-id"];
  const requestId = typeof incoming === "string" && /^[a-f0-9-]{36}$/i.test(incoming) ? incoming : randomUUID();
  response.locals.requestId = requestId;
  response.setHeader("X-Request-ID", requestId);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  const started = performance.now();
  let logged = false;
  const finish = () => {
    if (logged) return;
    logged = true;
    const statusCode = response.writableFinished ? response.statusCode : 499;
    // Log route templates only: never raw URL/query, headers, body, or identity.
    const entry = { event: "http_request", requestId, method: request.method,
      route: typeof request.route?.path === "string" ? request.route.path : "unmatched",
      statusCode, durationMs: Math.round(performance.now() - started),
      release: process.env.RELEASE_SHA ?? "development" };
    if (statusCode >= 500) logger.error(entry);
    else if (statusCode >= 400) logger.warn(entry);
    else logger.log(entry);
  };
  response.once("finish", finish);
  response.once("close", finish);
  next();
}
