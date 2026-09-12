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
import { AuditModule } from "./modules/audit/audit.module";
import { AcademicModule } from "./modules/academic/academic.module";
import { PeopleModule } from "./modules/people/people.module";
import { LearningModule } from "./modules/learning/learning.module";
import { AssessmentModule } from "./modules/assessment/assessment.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { TeamProjectsModule } from "./modules/team-projects/team-projects.module";
import { OperationsModule } from "./modules/operations/operations.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { validateEnvironment } from "./config/environment";
import { ReadinessService } from "./common/observability/readiness.service";
import { OwnerModule } from "./modules/owner/owner.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: "../../.env",
      validate: validateEnvironment,
    }),
    SupabaseModule,
    AuthModule,
    OwnerModule,
    AuthorizationModule,
    CalendarModule,
    CalendarEventsModule,
    UsersModule,
    TenantModule,
    PermissionsModule,
    NotificationsModule,
    AuditModule,
    AcademicModule,
    PeopleModule,
    LearningModule,
    AssessmentModule,
    FinanceModule,
    TeamProjectsModule,
    OperationsModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [ReadinessService],
})
export class AppModule {}
