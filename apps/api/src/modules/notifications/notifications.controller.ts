import { Controller, Get, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthGuard } from "../auth/guards/auth.guard";
import { PermissionGuard } from "../../common/authorization/guards/permission.guard";
import { RequirePermission } from "../../common/authorization/decorators/require-permission.decorator";
import { NotificationsService } from "./notifications.service";
@Controller("notifications") @UseGuards(AuthGuard,PermissionGuard)
export class NotificationsController {
 constructor(private readonly service:NotificationsService){}
 @Get() @RequirePermission("notifications.read") all(@Req() r:Request){return this.service.findAll(r.user!.id);}
 @Get("unread-count") @RequirePermission("notifications.read") count(@Req() r:Request){return this.service.unreadCount(r.user!.id);}
 @Patch("read-all") @RequirePermission("notifications.read") allRead(@Req() r:Request){return this.service.markAllRead(r.user!.id);}
 @Patch(":id/read") @RequirePermission("notifications.read") read(@Req() r:Request,@Param("id") id:string){return this.service.markRead(r.user!.id,id);}
}
