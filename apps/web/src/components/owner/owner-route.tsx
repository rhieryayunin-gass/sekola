"use client";
import type { ReactNode } from "react";
import { useIsOwner } from "../../lib/owner";
import { usePermissionStore } from "../../stores/permission-store";
import { AccessState } from "../layout/module-page";
export function OwnerRoute({ owner, children }: { owner: ReactNode; children: ReactNode }) {
  const context = usePermissionStore(s => s.context); const isOwner = useIsOwner();
  return !context ? <AccessState/> : isOwner ? owner : children;
}
