import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { AuthorizationService } from "../authorization.service";
import { REQUIRED_ACCESS_SCOPE_KEY, RequiredAccessScope } from "../decorators/require-access-scope.decorator";

@Injectable()
export class AccessScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly authorizationService: AuthorizationService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredAccessScope>(REQUIRED_ACCESS_SCOPE_KEY, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user) throw new ForbiddenException("Authenticated user is missing");
    if (!(await this.authorizationService.hasAccessScope(request.user.id, required.scopeType, required.scopeKey))) {
      throw new ForbiddenException(`Missing access scope: ${required.scopeType}:${required.scopeKey}`);
    }
    return true;
  }
}
