"use client";
import { ApprovalBoard } from "../part9/approvals";
import { useSchoolContext } from "../../lib/school";
import { useTranslations } from "../i18n/i18n-provider";
export function ApprovalWorkspace(){const school=useSchoolContext(),{locale}=useTranslations();if(school.isPending)return <p role="status">…</p>;if(school.isError)return <p role="alert">{school.error.message}</p>;if(school.data?.foundation_principal)return <p>{locale==="id-ID"?"Akun yayasan memiliki akses dashboard sekolah. Persetujuan ditangani Principal sekolah.":"Foundation accounts view school dashboards. School Principals handle approvals."}</p>;return <ApprovalBoard/>;}
