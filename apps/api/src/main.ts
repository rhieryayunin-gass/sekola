import { ConsoleLogger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./configure-app";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: new ConsoleLogger({ json: true }) });
  const config = app.get(ConfigService);

  configureApp(app);

  await app.listen(config.get<number>("PORT", 3001));
}

void bootstrap();
