import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { AuthModule } from "../auth/auth.module";
import { Module } from "@nestjs/common"; import { NotificationsController } from "./notifications.controller"; import { NotificationsService } from "./notifications.service";
@Module({ imports: [AuthModule, AuthorizationModule], controllers:[NotificationsController],providers:[NotificationsService],exports:[NotificationsService]}) export class NotificationsModule {}
