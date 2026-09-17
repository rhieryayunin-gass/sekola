"use client";
import { usePathname } from "next/navigation";
import { usePermissionStore } from "../../stores/permission-store";
import { useSchoolContext } from "../../lib/school";
import { UnreadIndicator } from "../school/unread-indicator";
import { BrandIcon } from "../layout/brand-icon";
import { openCenter } from "../../stores/center-store";
export function FloatingConnect(){
 const path=usePathname();const context=usePermissionStore(s=>s.context);const school=useSchoolContext();
 if(!path.startsWith("/dashboard")||!context?.permissions.some(p=>p.code==="connect.read")||school.data?.settings.modules.connect===false)return null;
 return <button type="button" className="ose-floating-connect p8-connect-launcher" aria-label="O-Connect" onClick={()=>openCenter("connect")}><BrandIcon name="connect" size={28}/><UnreadIndicator connect/></button>;
}
