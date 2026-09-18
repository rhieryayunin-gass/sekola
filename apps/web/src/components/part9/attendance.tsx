"use client";
import {useState} from "react";
import {useMutation,useQuery} from "@tanstack/react-query";
import {schoolRpc} from "../../lib/school";
import {usePermissionStore} from "../../stores/permission-store";
import {useTranslations} from "../i18n/i18n-provider";
import {Button,Input,Select} from "../ui";
import {Modal} from "../ui/modal";
import {statusName,useP9,useRefreshP9} from "./shared";
type Day={day:string;status:string|null;note:string|null};
export function PersonalAttendance({studentId,name}:{studentId?:string;name?:string}){
 const tr=useP9(),{locale}=useTranslations(),actor=usePermissionStore(s=>s.context?.userId);
 const q=useQuery({queryKey:["p9","attendance",actor,studentId],enabled:!!actor,queryFn:()=>schoolRpc<Day[]>("school_attendance_history",{student:studentId??null}),refetchInterval:60000});
 return <section className="p9-attendance"><h2>{name?`${tr("Attendance","Presensi")} · ${name}`:tr("My attendance","Catatan presensi saya")}</h2><small>{tr("Last seven days","Tujuh hari terakhir")}</small>{q.isError?<p role="alert">{q.error.message}</p>:q.isPending?<p role="status">{tr("Loading…","Memuat…")}</p>:<div className="p9-attendance-week">{q.data.map(day=><div className="p9-attendance-day" key={day.day} data-status={day.status} title={day.note??undefined}><small>{new Date(day.day+"T12:00:00").toLocaleDateString(locale,{weekday:"short",day:"numeric"})}</small><strong>{statusName(day.status,tr)}</strong>{day.note&&<details><summary>{tr("Reason","Alasan")}</summary><p>{day.note}</p></details>}</div>)}</div>}</section>;
}
type Options={children:{id:string;name:string}[];teachers:{id:string;name:string}[];is_parent:boolean;is_teacher:boolean;today:string};
export function LeaveRequest(){
 const tr=useP9(),actor=usePermissionStore(s=>s.context?.userId),roles=usePermissionStore(s=>s.context?.roles),refresh=useRefreshP9();const [open,setOpen]=useState(false);
 const allowed=roles?.some(r=>["PARENT","STAFF","TEACHER"].includes(r.code));
 const q=useQuery({queryKey:["p9","leave-options",actor],enabled:!!actor&&!!allowed,queryFn:()=>schoolRpc<Options>("school_leave_options")});
 const save=useMutation({mutationFn:(payload:Record<string,unknown>)=>schoolRpc("school_leave_submit",{payload}),onSuccess:async()=>{setOpen(false);await refresh();}});
 if(!allowed)return null;
 return <section className="p9-leave-launch"><Button variant="secondary" onClick={()=>{setOpen(true);save.reset();}}>{tr("Request leave","Ajukan izin")}</Button>{save.isSuccess&&<p role="status">{tr("Request submitted for approval.","Pengajuan dikirim untuk persetujuan.")}</p>}<Modal isOpen={open} onClose={()=>setOpen(false)} title={tr("Request leave","Pengajuan izin")}>
 {q.isError?<p role="alert">{q.error.message}</p>:!q.data?<p>{tr("Loading…","Memuat…")}</p>:<form className="p9-leave-form" onSubmit={e=>{e.preventDefault();save.mutate(Object.fromEntries(new FormData(e.currentTarget)));}}>
 {q.data.is_parent&&<Select name="student_id" label={tr("Child","Anak")} required><option value="">{tr("Choose a child","Pilih anak")}</option>{q.data.children.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
 <Select name="leave_type" label={tr("Leave type","Jenis izin")} required><option value="SICK">{tr("Sick","Sakit")}</option><option value="PERSONAL">{tr("Personal leave","Izin pribadi")}</option><option value="OTHER">{tr("Other","Keperluan lainnya")}</option></Select>
 <Input name="starts_on" label={tr("From","Mulai")} type="date" defaultValue={q.data.today} required/><Input name="ends_on" label={tr("Until","Sampai")} type="date" defaultValue={q.data.today} required/>
 {q.data.is_teacher&&<><Select name="substitute_teacher_id" label={tr("Substitute teacher","Guru pengganti")} required><option value="">{tr("Choose teacher","Pilih guru")}</option>{q.data.teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</Select><Select name="substitute_kind" label={tr("Substitute duty","Tugas pengganti")} required><option value="SUBJECT">{tr("Subject teacher","Guru mata pelajaran")}</option><option value="HOMEROOM">{tr("Homeroom teacher","Wali kelas")}</option></Select></>}
 <label className="school-field p9-full"><span>{tr("Reason","Alasan")}</span><textarea name="reason" minLength={5} maxLength={2000} required rows={3}/></label><p className="p9-full">{q.data.is_parent?tr("Your request will appear in the chat with your child's homeroom teacher.","Pengajuan akan muncul di chat dengan wali kelas anak Anda."):tr("The principal will review your request. Attendance is updated for the requested dates after approval.","Principal akan meninjau pengajuan. Presensi diperbarui untuk tanggal pengajuan setelah disetujui.")}</p>
 {save.isError&&<p role="alert" className="p9-full">{save.error.message}</p>}<Button type="submit" disabled={save.isPending} className="p9-full">{tr("Submit request","Kirim pengajuan")}</Button></form>}
 </Modal></section>;
}
