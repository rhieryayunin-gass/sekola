"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { schoolRpc } from "../../lib/school";
import { useTranslations } from "../i18n/i18n-provider";
import { Button, Input, Select } from "../ui";
import { PersonPicker, type PersonOption } from "./person-picker";
export function ProjectActions({project,users,mode,done}:{project:{id:string;name:string;starts_on?:string;due_on?:string;status:string};users:PersonOption[];mode:"member"|"project";done:()=>void}){
 const {locale}=useTranslations(),ind=locale==="id-ID",tr=(en:string,id:string)=>ind?id:en,cache=useQueryClient();
 const save=useMutation({mutationFn:(payload:Record<string,FormDataEntryValue>)=>schoolRpc("school_project_work",{project_uuid:project.id,action:mode,payload}),onSuccess:async()=>{await cache.invalidateQueries({queryKey:["team"]});await cache.invalidateQueries({queryKey:["school-calendar"]});await cache.invalidateQueries({queryKey:["school-committee"]});done();}});
 return <form className="grid gap-4" onSubmit={e=>{e.preventDefault();save.mutate(Object.fromEntries(new FormData(e.currentTarget)));}}><p>{project.name}</p>{mode==="member"?<><PersonPicker name="user_id" label={tr("Committee Member","Anggota Panitia")} users={users} required/><Select name="position" label={tr("Position","Posisi")}><option value="MEMBER">{tr("Member","Anggota")}</option><option value="COORDINATOR">{tr("Coordinator","Koordinator")}</option></Select></>:<><Input name="starts_on" type="date" label={tr("Starts","Mulai")} defaultValue={project.starts_on??""}/><Input name="due_on" type="date" label={tr("Ends","Selesai")} defaultValue={project.due_on??""}/><Select name="status" label="Status" defaultValue={project.status}>{["PLANNING","ACTIVE","ON_HOLD","COMPLETED","ARCHIVED"].map(s=><option key={s}>{s}</option>)}</Select></>}{save.isError&&<p role="alert">{save.error.message}</p>}<Button type="submit" disabled={save.isPending}>{tr("Save","Simpan")}</Button></form>;
}
