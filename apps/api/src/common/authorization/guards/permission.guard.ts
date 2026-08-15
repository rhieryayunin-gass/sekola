import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import {
  REQUIRED_PERMISSION_KEY,
} from "../decorators/require-permission.decorator";
import { AuthorizationService } from "../authorization.service";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const permission =
      this.reflector.getAllAndOverride<string>(
        REQUIRED_PERMISSION_KEY,
        [
          context.getHandler(),
          context.getClass(),
        ],
      );

    if (!permission) {
      return true;
    }

    const request =
      context.switchToHttp().getRequest<Request>();

    const user = request.user;

    if (!user) {
      throw new ForbiddenException(
        "Authenticated user is missing",
      );
    }

    const allowed =
      await this.authorizationService.hasPermission(
        user.id,
        permission,
      );

    if (!allowed) {
      throw new ForbiddenException(
        `Missing permission: ${permission}`,
      );
    }

    return true;
  }
}
