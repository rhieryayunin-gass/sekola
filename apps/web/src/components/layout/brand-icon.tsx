import { BookOpen, CalendarCheck, ClipboardCheck, GraduationCap, Layers3, MessageCircle, Users, Wallet, BriefcaseBusiness, School, UserRound, HeartHandshake, Crown } from "lucide-react";
const icons = {core:Layers3,academic:GraduationCap,attendance:CalendarCheck,learning:BookOpen,exam:ClipboardCheck,exams:ClipboardCheck,finance:Wallet,team:Users,connect:MessageCircle,OWNER:Crown,PRINCIPAL:School,STAFF:BriefcaseBusiness,TEACHER:GraduationCap,STUDENT:UserRound,PARENT:HeartHandshake};
export function BrandIcon({name,size=28}:{name:string;size?:number}) {
 const Icon = icons[name as keyof typeof icons] ?? Layers3;
 return <span className="ose-brand-icon" data-role={name} style={{width:size+20,height:size+20}} aria-hidden="true"><Icon size={size} strokeWidth={1.7}/><i/></span>;
}
