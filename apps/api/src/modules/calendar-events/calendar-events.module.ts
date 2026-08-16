import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { AuthModule } from "../auth/auth.module";
import { CalendarEventsController } from "./calendar-events.controller";
import { CalendarEventsService } from "./calendar-events.service";

@Module({
  imports: [
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [CalendarEventsController],
  providers: [CalendarEventsService],
})
export class CalendarEventsModule {}