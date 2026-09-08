import { SetMetadata } from "@nestjs/common";

export const REQUIRED_ACCESS_SCOPE_KEY = "requiredAccessScope";

export interface RequiredAccessScope {
  scopeKey: string;
  scopeType: "TENANT" | "MODULE" | "RESOURCE";
}

export const RequireAccessScope = (scope: RequiredAccessScope) => SetMetadata(REQUIRED_ACCESS_SCOPE_KEY, scope);
