import { Module } from "@nestjs/common";
import { AuthorizationService } from "./authorization.service";
import { PermissionGuard } from "./guards/permission.guard";

@Module({
  providers: [
    AuthorizationService,
    PermissionGuard,
  ],
  exports: [
    AuthorizationService,
    PermissionGuard,
  ],
})
export class AuthorizationModule {}
