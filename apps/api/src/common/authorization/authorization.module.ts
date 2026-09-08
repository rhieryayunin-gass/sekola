import { Module } from "@nestjs/common";
import { AuthorizationService } from "./authorization.service";
import { PermissionGuard } from "./guards/permission.guard";
import { AccessScopeGuard } from "./guards/access-scope.guard";

@Module({
  providers: [
    AuthorizationService,
    PermissionGuard,
    AccessScopeGuard,
  ],
  exports: [
    AuthorizationService,
    PermissionGuard,
    AccessScopeGuard,
  ],
})
export class AuthorizationModule {}
