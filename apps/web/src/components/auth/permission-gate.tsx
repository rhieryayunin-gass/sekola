"use client";

import { ReactNode } from "react";
import { usePermissionStore } from "../../stores/permission-store";

export function PermissionGate({ permission, children }: { permission: string; children: ReactNode }) {
  const context = usePermissionStore((state) => state.context);
  const allowed = usePermissionStore((state) => state.has(permission));

  if (!context || !allowed) return null;
  return <>{children}</>;
}
