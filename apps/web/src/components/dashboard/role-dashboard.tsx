"use client";
import { OwnerDashboard } from "../owner/owner-dashboard";
import { RoleOverview } from "../school/role-overview";
import { useIsOwner } from "../../lib/owner";
import { usePermissionStore } from "../../stores/permission-store";
import { AccessState } from "../layout/module-page";
export function RoleDashboard(){const owner=useIsOwner();const context=usePermissionStore(s=>s.context);if(!context)return <AccessState/>;return owner?<OwnerDashboard/>:<RoleOverview/>;}
