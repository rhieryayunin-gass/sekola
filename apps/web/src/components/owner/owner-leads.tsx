"use client";
import { useState } from "react";
import { useOwnerList, value, date } from "../../lib/owner";
import { OwnerShell, OwnerSearch, OwnerTable } from "./owner-ui";
import { useTranslations } from "../i18n/i18n-provider";
export function OwnerLeads(){
 const {t,locale}=useTranslations();const id=locale==="id-ID";const [query,setQuery]=useState("");const [page,setPage]=useState(1);const q=useOwnerList("leads",{query},page);
 return <OwnerShell><div className="owner-heading"><div><h2>{t("ownerLeads")}</h2><p>{id?"Hasil Digital Maturity dan kontak sekolah yang memberikan persetujuan tindak lanjut.":"Digital Maturity results and school contacts who consented to follow-up."}</p></div></div><OwnerSearch query={query} setQuery={v=>{setQuery(v);setPage(1);}}/><OwnerTable headers={id?["Sekolah","Kontak","Email","WhatsApp","Siswa","Skor / tingkat","Rekomendasi","Tahap","Tanggal"]:["School","Contact","Email","WhatsApp","Students","Score / level","Recommendation","Stage","Date"]} list={q.data} loading={q.isPending} error={q.isError} retry={()=>void q.refetch()} page={page} setPage={setPage}>{q.data?.items.map(r=><tr key={r.id}><td>{value(r,"school_name")}</td><td>{value(r,"contact_name")}</td><td>{value(r,"email")}</td><td>{value(r,"phone")}</td><td>{value(r,"student_count")}</td><td>{value(r,"score")} / 100<small>{["Manual","Digitized","Connected","Smart","Intelligent"][Math.min(4,Math.max(0,Math.ceil(Number(r.score)/20)-1))]}</small></td><td>{value(r,"recommended_plan")}</td><td>{value(r,"stage")}</td><td>{date(r.created_at,locale)}</td></tr>)}</OwnerTable></OwnerShell>;
}
