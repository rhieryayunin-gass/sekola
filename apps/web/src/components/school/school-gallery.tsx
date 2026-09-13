"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMediaContext,useMediaEntries } from "../media/media-hooks";
import { DeleteMedia,MediaUpload } from "../media/media-uploader";
import { usePermissionStore } from "../../stores/permission-store";
import { mediaUrl } from "../../lib/media";
import { createClient } from "../../lib/supabase/client";
import { useTranslations } from "../i18n/i18n-provider";
import { OwnerDialog } from "../owner/owner-ui";
import { Button,Input } from "../ui";
export function SchoolGallery({preview=false}:{preview?:boolean}){
 const {locale,t}=useTranslations();const id=locale==="id-ID";const context=usePermissionStore(s=>s.context);const staff=context?.roles.some(r=>r.code==="STAFF");const ctx=useMediaContext();const prefix=ctx.data?.tenant_id?`${ctx.data.tenant_id}/gallery`:undefined;const q=useMediaEntries("tenant-media",prefix);const cache=useQueryClient();const [view,setView]=useState<{name:string;updated_at:string|null}>();const [editing,setEditing]=useState(false);const [caption,setCaption]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 const name=(s:string)=>s.replace(/^[a-f0-9-]{36}-/,"").replace(/\.[^.]+$/,"").replaceAll("_"," ");
 const files=q.data?.filter(f=>f.id)??[];
 async function rename(){if(!view||!prefix)return;setBusy(true);setError("");try{const safe=caption.trim().replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,120);if(!safe)throw new Error(id?"Isi judul foto":"Enter a photo title");const next=`${crypto.randomUUID()}-${safe}.${view.name.split(".").pop()}`;const {error}=await createClient().storage.from("tenant-media").move(`${prefix}/${view.name}`,`${prefix}/${next}`);if(error)throw error;setView(undefined);setEditing(false);await cache.invalidateQueries({queryKey:["media"]});}catch(e){setError(e instanceof Error?e.message:t("loadError"));}finally{setBusy(false);}}
 return <section className="p5-gallery"><div className="school-section-title"><div><p className="ose-eyebrow">SCHOOL MOMENTS</p><h2>{t("gallery")}</h2><p>{id?"Cerita dan kegiatan dari sekolah kita.":"Stories and moments from our school."}</p></div>{preview&&<Link href="/dashboard/gallery" className="ose-link">{id?"Lihat semua":"View all"} →</Link>}</div>{staff&&!preview&&prefix&&<MediaUpload bucket="tenant-media" prefix={prefix}/>} {(q.isError||ctx.isError)&&<p role="alert">{t("loadError")}<Button variant="ghost" onClick={()=>void q.refetch()}>{t("retry")}</Button></p>}{q.isLoading?<p role="status">{t("loading")}</p>:files.length?<div className="p5-gallery-grid">{(preview?files.slice(0,6):files).map(f=><figure key={f.id}><button className="p5-gallery-photo" onClick={()=>{setView(f);setEditing(false);setError("");}} aria-label={name(f.name)}><Image unoptimized src={mediaUrl("tenant-media",`${prefix}/${f.name}`,f.updated_at)} alt={name(f.name)} width={800} height={600}/><span>{name(f.name)}</span></button>{staff&&!preview&&<DeleteMedia bucket="tenant-media" path={`${prefix}/${f.name}`}/>}</figure>)}</div>:<p className="school-empty">{id?"Foto kegiatan sekolah akan tampil di sini.":"School event photos will appear here."}</p>}{view&&<OwnerDialog wide title={name(view.name)} close={()=>setView(undefined)}><Image className="p5-lightbox" unoptimized src={mediaUrl("tenant-media",`${prefix}/${view.name}`,view.updated_at)} alt={name(view.name)} width={1200} height={900}/>{staff&&!preview&&(editing?<div className="school-editor"><Input label={id?"Judul foto":"Photo title"} value={caption} maxLength={120} onChange={e=>setCaption(e.target.value)}/>{error&&<p role="alert">{error}</p>}<Button disabled={busy} onClick={()=>void rename()}>{t("save")}</Button></div>:<Button variant="ghost" onClick={()=>{setCaption(name(view.name));setEditing(true);}}>{id?"Edit judul":"Edit title"}</Button>)}</OwnerDialog>}</section>;
}
