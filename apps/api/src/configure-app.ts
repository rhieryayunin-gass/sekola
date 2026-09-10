import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { json, urlencoded } from "express";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { UuidParamPipe } from "./common/data/uuid-param.pipe";
import { httpLogging } from "./common/observability/http-logging";
import { parseCorsOrigins } from "./config/environment";

export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.setGlobalPrefix("api/v1");
  app.use(httpLogging);
  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: false, limit: "100kb" }));
  app.enableCors({ credentials: true, origin: parseCorsOrigins(config.get<string>("CORS_ORIGINS")), exposedHeaders: ["X-Request-ID"] });
  app.enableShutdownHooks();
  app.useGlobalPipes(new UuidParamPipe(), new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
}
