import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { SupabaseModule } from "./common/supabase/supabase.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AuthorizationModule } from "./common/authorization/authorization.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { CalendarEventsModule } from "./modules/calendar-events/calendar-events.module";
import { UsersModule } from "./modules/users/users.module";
import { TenantModule } from "./modules/tenants/tenant.module";
import { PermissionsModule } from "./modules/permissions/permissions.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { validateEnvironment } from "./config/environment";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: "../../.env",
      validate: validateEnvironment,
    }),
    SupabaseModule,
    AuthModule,
    AuthorizationModule,
    CalendarModule,
    CalendarEventsModule,
    UsersModule,
    TenantModule,
    PermissionsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
