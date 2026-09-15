import { BookOpenText, ScanFace, ClipboardPenLine, GraduationCap, PanelsTopLeft, MessagesSquare, LayoutDashboard, WalletCards, BriefcaseBusiness, School, ContactRound, HeartHandshake, ShieldCheck, Presentation } from "lucide-react";
const icons = {core:PanelsTopLeft,academic:GraduationCap,attendance:ScanFace,learning:BookOpenText,exam:ClipboardPenLine,exams:ClipboardPenLine,finance:WalletCards,team:LayoutDashboard,connect:MessagesSquare,OWNER:ShieldCheck,PRINCIPAL:School,STAFF:BriefcaseBusiness,TEACHER:Presentation,STUDENT:ContactRound,PARENT:HeartHandshake};
export function BrandIcon({name,size=28}:{name:string;size?:number}) {
 const Icon = icons[name as keyof typeof icons] ?? PanelsTopLeft;
 return <span className="ose-brand-icon" data-role={name} style={{width:size+20,height:size+20}} aria-hidden="true"><Icon size={size} strokeWidth={1.8}/></span>;
}
