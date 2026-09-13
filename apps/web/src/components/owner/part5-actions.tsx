"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { schoolRpc } from "../../lib/school";
import { OwnerDialog } from "./owner-ui";
import { useTranslations } from "../i18n/i18n-provider";
import { Button, Input } from "../ui";
export function ArchiveTenant({id,name,archived,disabled}:{id:string;name:string;archived:boolean;disabled?:boolean}){
 const {locale}=useTranslations();const ind=locale==="id-ID";const [open,setOpen]=useState(false);const [confirmation,setConfirmation]=useState("");const cache=useQueryClient();const m=useMutation({mutationFn:()=>schoolRpc("school_tenant_archive",{target:id,confirmation,restore:archived}),onSuccess:async()=>{setOpen(false);await cache.invalidateQueries({queryKey:["owner"]});}});
 const label=!archived?(ind?"Hapus tenant":"Delete tenant"):(ind?"Pulihkan tenant":"Restore tenant");
 return <><Button size="sm" variant="ghost" disabled={disabled} onClick={()=>{setOpen(true);setConfirmation("");m.reset();}}>{label}</Button>{open&&<OwnerDialog title={label} close={()=>setOpen(false)}><p>{!archived?(ind?"Tenant akan diarsipkan dan akses pengguna sekolah dihentikan. Riwayat tetap tersimpan untuk pemulihan.":"The tenant will be archived and school access disabled. Records remain available for restoration."):(ind?"Pengguna aktif sekolah akan dapat mengakses kembali akunnya.":"Active school users will regain access.")}</p><Input label={`${ind?"Ketik nama sekolah":"Type school name"}: ${name}`} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/>{m.isError&&<p role="alert">{m.error.message}</p>}<Button variant={!archived?"danger":"primary"} disabled={confirmation!==name||m.isPending} onClick={()=>m.mutate()}>{label}</Button></OwnerDialog>}</>;
}
export function StaffTeacherRoles({userId,roles}:{userId:string;roles:string[]}){
 const {locale}=useTranslations();const id=locale==="id-ID";const cache=useQueryClient();const [open,setOpen]=useState(false);const [selected,setSelected]=useState(roles);const m=useMutation({mutationFn:()=>schoolRpc("school_staff_teacher_roles",{target:userId,codes:selected}),onSuccess:async()=>{setOpen(false);await cache.invalidateQueries({queryKey:["owner"]});}});
 if(!roles.length||roles.some(r=>!["STAFF","TEACHER"].includes(r)))return null;
 return <><Button size="sm" variant="ghost" onClick={()=>{setSelected(roles);setOpen(true);m.reset();}}>{id?"Atur peran ganda":"Manage dual role"}</Button>{open&&<OwnerDialog title={id?"Staf dan Teacher":"Staff and Teacher"} close={()=>setOpen(false)}><p>{id?"Pilih satu atau kedua peran. Penugasan mengajar tetap diatur melalui Academic.":"Select one or both roles. Teaching assignments are managed in Academic."}</p>{["STAFF","TEACHER"].map(r=><label key={r} className="school-consent"><input type="checkbox" checked={selected.includes(r)} onChange={e=>setSelected(old=>e.target.checked?[...old,r]:old.filter(v=>v!==r))}/>{r}</label>)}{m.isError&&<p role="alert">{m.error.message}</p>}<Button disabled={!selected.length||m.isPending} onClick={()=>m.mutate()}>{id?"Simpan peran":"Save roles"}</Button></OwnerDialog>}</>;
}
