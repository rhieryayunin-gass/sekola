import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./guards/auth.guard";
import { AuthorizationService } from "../../common/authorization/authorization.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get("me")
  @UseGuards(AuthGuard)
  async me(@Req() request: Request) {
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException("Authenticated user is missing");
    }

    return this.authService.getCurrentUser(user.id);
  }

  @Get("context")
  @UseGuards(AuthGuard)
  async context(@Req() request: Request) {
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException("Authenticated user is missing");
    }

    return this.authorizationService.getContext(user.id);
  }

}
