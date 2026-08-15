import { Module } from "@nestjs/common";
import { SupabaseModule } from "../../common/supabase/supabase.module";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";
import { AuthModule } from "../auth/auth.module";
import { AuthorizationModule } from "../../common/authorization/authorization.module";

@Module({
  imports: [
    SupabaseModule,
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
