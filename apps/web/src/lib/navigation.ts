import type { PermissionContext } from "../stores/permission-store";
import type { MessageKey } from "./i18n";
import { primaryRole } from "./modules";
export type NavItem = { key: string; label: MessageKey; href: string; module?: string };
const items: Record<string, NavItem> = {
 dashboard:{key:"dashboard",label:"dashboard",href:"/dashboard"},
 academic:{key:"academic",label:"academic",href:"/dashboard/academic",module:"academic"},
 attendance:{key:"attendance",label:"attendance",href:"/dashboard/attendance",module:"attendance"},
 learning:{key:"learning",label:"learning",href:"/dashboard/learning",module:"learning"},
 exams:{key:"exams",label:"exams",href:"/dashboard/exams",module:"exams"},
 finance:{key:"finance",label:"finance",href:"/dashboard/finance",module:"finance"},
 gallery:{key:"gallery",label:"gallery",href:"/dashboard/gallery",module:"core"},
 team:{key:"team",label:"team",href:"/dashboard/team",module:"team"},
 approval:{key:"approval",label:"approval",href:"/dashboard/approval",module:"core"},
 connect:{key:"connect",label:"chat",href:"/dashboard/connect",module:"connect"},
};
const menus: Record<string,string[]> = {
 PRINCIPAL:["dashboard","gallery","approval","connect"],
 STAFF:["dashboard","academic","gallery","team","finance","connect"],
 TEACHER:["dashboard","academic","attendance","learning","exams","gallery","team","connect"],
 STUDENT:["dashboard","academic","learning","exams","team","connect"],
 PARENT:["dashboard","learning","exams","team","finance","gallery","connect"],
};
export function roleNavigation(context: PermissionContext | null, flags: Record<string,boolean> = {}): NavItem[] {
 const role = primaryRole(context);
 const keys = role === "STAFF" && context?.roles.some(r=>r.code==="TEACHER")
  ? ["dashboard","academic","attendance","learning","exams","gallery","team","finance","connect"] : menus[role] ?? [];
 return keys.map(key=>items[key]).filter(item=>!item.module || flags[item.module] !== false);
}
