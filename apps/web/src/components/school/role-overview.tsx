"use client";
import Image from "next/image";
import {PersonalAttendance,LeaveRequest} from "../part9/attendance";
import {PrincipalDashboard} from "../part9/principal-dashboard";
import {StaffShortcuts} from "../part9/staff-directory";
import {useApprovalCount} from "../part9/shared";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "../i18n/i18n-provider";
import { useAuthStore } from "../../stores/auth-store";
import { usePermissionStore } from "../../stores/permission-store";
import { primaryRole } from "../../lib/modules";
import { schoolRpc } from "../../lib/school";
import { BrandIcon } from "../layout/brand-icon";
import { SchoolGallery } from "./school-gallery";
import { Button } from "../ui";
import { SchoolSetupLink } from "../part7/setup-link";
import type { MessageKey } from "../../lib/i18n";
type Dashboard={school:string;students:number;teachers:number;classes:number;attendance_today:number;pending_approvals:{id:string;status:string;current_step:number;approval_steps:{sequence:number;approver_user_id:string;status:string}[]}[]|null;children:{id:string;name:string;number:string;attendance:string|null}[];attendance_trend:{day:string;present:number;recorded:number}[];teaching_courses:number;assignments_to_review:number;family_tasks:number;family_balance:number|null};
const intro:Record<string,MessageKey>={PRINCIPAL:"principalIntro",STAFF:"staffIntro",TEACHER:"teacherIntro",STUDENT:"studentIntro",PARENT:"parentIntro"};
export function RoleOverview(){
 const {locale,t}=useTranslations();const id=locale==="id-ID";const context=usePermissionStore(s=>s.context);const user=useAuthStore(s=>s.user);const role=primaryRole(context);const q=useQuery({queryKey:["role-dashboard",context?.userId],enabled:!!context,queryFn:()=>schoolRpc<Dashboard>("school_role_dashboard"),refetchInterval:60000});const d=q.data;const approvalCount=useApprovalCount();const pending=approvalCount.data??0;
 const metrics: [string,string|number|undefined][] = ["STUDENT","PARENT"].includes(role)?[[id?"Siswa terhubung":"Linked students",d?.children.length],[id?"Kelas":"Classes",d?.classes],[id?"Tugas belum dikumpulkan":"Pending assignments",d?.family_tasks],role==="PARENT"?[id?"Sisa tagihan":"Outstanding bills",d?new Intl.NumberFormat(locale,{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(d.family_balance??0):undefined]:[id?"Hadir hari ini":"Present today",d?.attendance_today]]:role==="TEACHER"?[[id?"Siswa kelas Anda":"Students in your classes",d?.students],[id?"Course aktif":"Active courses",d?.teaching_courses],[id?"Perlu penilaian":"Awaiting review",d?.assignments_to_review],[id?"Hadir hari ini":"Present today",d?.attendance_today]]:[[id?"Siswa":"Students",d?.students],[id?"Guru aktif":"Active teachers",d?.teachers],[id?"Kelas":"Classes",d?.classes],[id?"Hadir hari ini":"Present today",d?.attendance_today]];
 return <section className="owner-workspace"><header className="owner-banner p5-role-banner"><div><p className="ose-eyebrow"><BrandIcon name={role} size={22}/> OSEKOLA · {role}</p><h1>{t("hello")}, {user?.user_metadata.full_name||user?.email?.split("@")[0]||t("account")}.</h1><p>{t(intro[role]??"workspaceIntro")}</p></div><Image src={`/illustrations/${role.toLowerCase()}.png`} alt="" width={1536} height={1024} sizes="(max-width: 640px) 260px, 440px" priority/></header>{role==="PRINCIPAL"&&pending>0&&<div className="p9-approval-beacon"><Link className="ose-cta" href="/dashboard/approval">Need Approval <span>{pending}</span> →</Link></div>}<SchoolSetupLink/><LeaveRequest/>{q.isError?<p role="alert">{t("loadError")}<Button onClick={()=>void q.refetch()}>{t("retry")}</Button></p>:<>{role==="PRINCIPAL"?<PrincipalDashboard/>:role==="STAFF"?<StaffShortcuts/>:<div className="owner-metrics owner-metrics-four">{metrics.map(([label,v])=><article className="owner-metric glass-panel" key={label}><span>{label}</span><strong>{v??"…"}</strong><small>{d?.school}</small></article>)}</div>}</>}{role!=="STUDENT"&&<SchoolGallery preview/>}{role==="PARENT"?d?.children.map(child=><PersonalAttendance key={child.id} studentId={child.id} name={child.name}/>):<PersonalAttendance/>}</section>;
}
