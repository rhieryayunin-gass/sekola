export interface AuthorizationRole {
  id: string;
  code: string;
  name: string;
}

export interface AuthorizationPermission {
  id: string;
  code: string;
  name: string;
}

export interface AuthorizationUserLevel {
  id: string;
  code: string;
  name: string;
}

export type AccessScopeType = "GLOBAL" | "TENANT" | "MODULE" | "RESOURCE";

export interface AuthorizationAccessScope {
  scopeKey: string;
  scopeType: AccessScopeType;
}

export interface AuthorizationContext {
  userId: string;
  userLevel: AuthorizationUserLevel | null;
  roles: AuthorizationRole[];
  permissions: AuthorizationPermission[];
  accessScopes: AuthorizationAccessScope[];
}
