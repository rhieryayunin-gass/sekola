"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "../i18n/i18n-provider";
import { usePermissionStore } from "../../stores/permission-store";
import { schoolRpc } from "../../lib/school";
import { createClient } from "../../lib/supabase/client";
export function useP9() { const {locale}=useTranslations();return (en:string,id:string)=>locale==="id-ID"?id:en; }
export function useApprovalCount(){const actor=usePermissionStore(s=>s.context?.userId);return useQuery({queryKey:["p9","approval-count",actor],enabled:!!actor,queryFn:()=>schoolRpc<number>("school_approval_count"),refetchInterval:20000});}
export function useRefreshP9(){const qc=useQueryClient();return ()=>Promise.all(["p9","role-dashboard","school-dashboard","school-records","school-catalog","school-context","school-attendance","notifications","connect","owner"].map(k=>qc.invalidateQueries({queryKey:[k]})));}
export type PeopleResult={done:boolean;id:string;email?:string;temporary_password?:string};
export async function executePeople(changeId:string){const {data,error}=await createClient().functions.invoke("school-people",{body:{change_id:changeId}});if(error)throw new Error(data?.error??error.message);if(data?.error)throw new Error(data.error);return data as PeopleResult;}
export const statusName=(status:string|null,tr:(en:string,id:string)=>string)=>({PRESENT:tr("Present","Hadir"),LATE:tr("Late","Terlambat"),SICK:tr("Sick","Sakit"),EXCUSED:tr("Excused","Izin"),ABSENT:tr("Absent","Alpa"),UNRECORDED:tr("Not recorded","Belum tercatat")}[status??"UNRECORDED"]??status);
