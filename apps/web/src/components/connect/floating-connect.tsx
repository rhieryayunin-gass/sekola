"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { usePermissionStore } from "../../stores/permission-store";
import { useSchoolContext } from "../../lib/school";
import { UnreadIndicator } from "../school/unread-indicator";
export function FloatingConnect() {
 const path=usePathname(); const context=usePermissionStore(s=>s.context); const school=useSchoolContext();
 if(path==="/dashboard/connect" || (context && (!context.permissions.some(p=>p.code==="connect.read") || school.data?.settings.modules.connect===false))) return null;
 return <Link className="ose-floating-connect" href={context?"/dashboard/connect":"/login?next=%2Fdashboard%2Fconnect"} aria-label="O-Connect"><MessageCircle size={24}/><span>O-Connect</span>{context&&<UnreadIndicator connect/>}</Link>;
}
