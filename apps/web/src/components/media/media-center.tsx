"use client";
import Image from "next/image";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Copy } from "lucide-react";
import { createClient } from "../../lib/supabase/client";
import { mediaUrl, imageTypes, type MediaBucket } from "../../lib/media";
import { useTranslations } from "../i18n/i18n-provider";
import { useMediaContext, useMediaEntries } from "./media-hooks";
import { DeleteMedia, FixedMedia, MediaUpload } from "./media-uploader";
import { schoolRpc, type SchoolRow } from "../../lib/school";

function OwnerAvatars() {
  const [userId, setUserId] = useState("");
  const { locale } = useTranslations();
  const { data: ctx } = useMediaContext();
  const { data, error } = useQuery({ queryKey: ["media", "people", ctx?.user_id], enabled: !!ctx?.can_manage_media, queryFn: async () => {
    const users = [];
    for (let page = 1; ; page++) {
      const result = await schoolRpc<SchoolRow[]>("school_catalog", {resource:"users",page_offset:(page-1)*500});
      users.push(...result.map(u=>({id:u.id,full_name:String(u.name??u.full_name??"Pengguna")})));
      if(result.length<500) break;
    }
    return users;
  } });
  return <section className="mb-6"><label className="grid gap-2 text-sm"><span>{locale === "id-ID" ? "Kelola foto pengguna sekolah" : "Manage school user photos"}</span><select className="ose-control" value={userId} onChange={e => setUserId(e.target.value)}><option value="">{locale === "id-ID" ? "Pilih pengguna" : "Choose user"}</option>{data?.map(user => <option key={user.id} value={user.id}>{user.full_name}</option>)}</select></label>{error && <p role="alert">{locale === "id-ID" ? "Daftar pengguna gagal dimuat." : "Unable to load users."}</p>}{userId && <FixedMedia key={userId} kind="avatar" userId={userId}/>}</section>;
}
function MediaLibrary({ category }: { category: "gallery" | "learning" }) {
  const { data: ctx } = useMediaContext();
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const [copied, setCopied] = useState("");
  const bucket: MediaBucket = category === "gallery" ? "tenant-media" : "tenant-learning";
  const root = ctx?.tenant_id ? `${ctx.tenant_id}/${category}` : undefined;
  const rootQuery = useMediaEntries(bucket, root);
  const nested = useQuery({ queryKey: ["media", "learning-files", ctx?.user_id, root, rootQuery.dataUpdatedAt], enabled: category === "learning" && !!root && !!rootQuery.data, queryFn: async () => {
    const folders = rootQuery.data?.filter(f => !f.id) ?? [];
    const results = await Promise.all(folders.map(async folder => {
      const files = [];
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await createClient().storage.from(bucket).list(`${root}/${folder.name}`, { limit: 100, offset });
        if (error) throw error;
        files.push(...data.map(file => ({ ...file, path: `${root}/${folder.name}/${file.name}`, author: folder.name })));
        if (data.length < 100) break;
      }
      return files;
    }));
    return results.flat();
  } });
  if (!ctx?.tenant_id || !root) return null;
  const upload = category === "gallery" ? ctx.can_manage_media : ctx.can_upload_learning;
  const prefix = category === "gallery" ? root : `${root}/${ctx.user_id}`;
  const files = category === "gallery" ? rootQuery.data?.filter(f => f.id).map(f => ({ ...f, path: `${root}/${f.name}`, author: "" })) : nested.data;
  const error = rootQuery.error || nested.error;
  const loading = rootQuery.isLoading || (category === "learning" && nested.isLoading);
  async function copyLink(path: string) {
    try { await navigator.clipboard.writeText(`${location.origin}${mediaUrl(bucket, path)}`); setCopied(path); }
    catch { setCopied("error"); }
  }
  return <section className="glass-panel rounded-3xl p-6"><h2 className="text-xl font-semibold">{category === "gallery" ? (id ? "Galeri sekolah" : "School gallery") : (id ? "Berkas pembelajaran" : "Learning files")}</h2><p className="text-sm text-muted-foreground mt-2">{id ? "Berkas di sini hanya tersedia bagi pengguna aktif sekolah Anda. Tautan berkas tetap memerlukan login." : "Files are available only to active users of your school. File links still require sign-in."}</p>{upload && <MediaUpload bucket={bucket} prefix={prefix}/>}<div role="status" className="my-5 text-sm">{error ? (id ? "Gagal memuat berkas. Silakan muat ulang." : "Unable to load files. Please reload.") : loading ? (id ? "Memuat berkas…" : "Loading files…") : !files?.length ? (id ? "Belum ada berkas." : "No files yet.") : `${files.length} ${id ? "berkas" : "files"}`}{copied === "error" && (id ? " Tautan gagal disalin." : " Unable to copy link.")}</div><div className="ose-media-grid">{files?.map(file => <article className="ose-media-card" key={file.path}>{imageTypes.includes(file.metadata?.mimetype ?? "") ? <Image unoptimized src={mediaUrl(bucket, file.path, file.updated_at)} alt={file.name.replace(/^[a-f0-9-]{36}-/, "")} width={300} height={200}/> : <FileText size={44} className="text-secondary"/>}<p>{file.name.replace(/^[a-f0-9-]{36}-/, "")}</p><div className="ose-media-actions"><a href={mediaUrl(bucket, file.path)} download><Download size={15}/>{id ? "Unduh" : "Download"}</a><button onClick={() => void copyLink(file.path)}><Copy size={15}/>{copied === file.path ? (id ? "Tersalin" : "Copied") : (id ? "Salin tautan" : "Copy link")}</button></div>{(ctx.can_manage_media || (category === "learning" && ctx.can_upload_learning && file.author === ctx.user_id)) && <DeleteMedia bucket={bucket} path={file.path}/>}</article>)}</div></section>;
}
export function MediaCenter({ initialCategory = "gallery" }: { initialCategory?: "gallery" | "learning" }) {
  const { data: ctx, isLoading, error } = useMediaContext();
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const [category, setCategory] = useState<"gallery" | "learning">(initialCategory);
  return <main id="ose-main" className="ose-workspace"><div className="ose-page-heading"><div><p className="ose-eyebrow">O-CORE</p><h1>{id ? "Pusat media" : "Media center"}</h1><p>{id ? "Identitas, dokumentasi, dan materi sekolah dalam satu tempat." : "School identity, moments, and learning resources in one place."}</p></div></div>{isLoading ? <p>{id ? "Memuat…" : "Loading…"}</p> : error ? <p role="alert">{id ? "Pusat media belum dapat diakses. Silakan coba kembali." : "Media center is unavailable. Please try again."}</p> : ctx && <>{ctx.is_platform_admin && <FixedMedia kind="platform"/>}{ctx.tenant_id && <><FixedMedia kind="avatar"/>{ctx.can_manage_media && <><FixedMedia kind="school"/><OwnerAvatars/></>}<div className="ose-media-actions mb-5" role="group" aria-label={id ? "Kategori media" : "Media categories"}><button aria-pressed={category === "gallery"} onClick={() => setCategory("gallery")}>{id ? "Galeri sekolah" : "School gallery"}</button><button aria-pressed={category === "learning"} onClick={() => setCategory("learning")}>{id ? "Pembelajaran" : "Learning"}</button></div><MediaLibrary key={category} category={category}/></>}</>}</main>;
}
