import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { Reflector } from "@nestjs/core";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ExecutionContext } from "@nestjs/common";
import { PermissionGuard } from "../../common/authorization/guards/permission.guard";
import { AuthorizationService } from "../../common/authorization/authorization.service";
import { REQUIRED_PERMISSION_KEY } from "../../common/authorization/decorators/require-permission.decorator";
import { AssignmentsController, CoursesController, LessonsController, SubmissionsController } from "./learning.controller";

describe("Learning permission enforcement", () => {
  for (const [name,controller] of [["courses",CoursesController],["lessons",LessonsController],["assignments",AssignmentsController],["submissions",SubmissionsController]] as const) {
    it(`protects every ${name} endpoint`, () => {
      expect(Reflect.getMetadata(GUARDS_METADATA,controller)).toContain(PermissionGuard);
      for (const [method,permission] of [["list","read"],["create","create"],["update","update"]] as const) expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY,controller.prototype[method])).toBe(`${name}.${permission}`);
    });
  }
  it("denies authenticated users without module permission", async () => {
    const authorization = { hasPermission: vi.fn(async () => false) };
    const guard = new PermissionGuard(new Reflector(), authorization as unknown as AuthorizationService);
    const context = { getHandler:()=>CoursesController.prototype.create, getClass:()=>CoursesController, switchToHttp:()=>({getRequest:()=>({user:{id:"student"}})}) } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toThrow("Missing permission");
    expect(authorization.hasPermission).toHaveBeenCalledWith("student","courses.create");
  });
});
