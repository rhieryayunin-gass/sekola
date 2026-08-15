import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { SupabaseModule } from "./common/supabase/supabase.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AuthorizationModule } from "./common/authorization/authorization.module";
import { CalendarModule } from "./modules/calendar/calendar.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: "../../.env",
    }),
    SupabaseModule,
    AuthModule,
    AuthorizationModule,
    CalendarModule,
  ],
  controllers: [AppController],
})
export class AppModule {}