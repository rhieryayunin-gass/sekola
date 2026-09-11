"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { createClient } from "../../lib/supabase/client";
import { mediaUrl, validateMedia, type MediaBucket } from "../../lib/media";
import { useTranslations } from "../i18n/i18n-provider";
import { useMediaContext, useMediaEntries } from "./media-hooks";

export function MediaUpload({ bucket, prefix, fixedName, onUploaded }: { bucket: MediaBucket; prefix: string; fixedName?: string; onUploaded?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { locale } = useTranslations();
  const id = locale === "id-ID";
  const cache = useQueryClient();
  async function upload(file?: File) {
    if (!file) return;
    setMessage("");
    const invalid = validateMedia(file, bucket);
    if (invalid) { setMessage(invalid === "type" ? (id ? "Format berkas tidak didukung." : "Unsupported file type.") : (id ? "Berkas kosong atau terlalu besar." : "File is empty or too large.")); if (input.current) input.current.value = ""; return; }
    setBusy(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-130);
      const name = fixedName ?? `${crypto.randomUUID()}-${safe}`;
      const { error } = await createClient().storage.from(bucket).upload(`${prefix}/${name}`, file, { upsert: !!fixedName, contentType: file.type, cacheControl: "0" });
      if (error) throw error;
      await cache.invalidateQueries({ queryKey: ["media"] });
      if (bucket === "platform-media") window.dispatchEvent(new Event("osekola-brand-change"));
      setMessage(id ? "Berkas berhasil disimpan." : "File saved.");
      onUploaded?.();
    } catch { setMessage(id ? "Unggah gagal. Periksa koneksi dan hak akses Anda." : "Upload failed. Check your connection and access."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return <div><input ref={input} type="file" className="sr-only" tabIndex={-1} aria-label={id ? "Pilih berkas" : "Choose file"} accept={bucket === "tenant-learning" ? "image/png,image/jpeg,image/webp,application/pdf,video/mp4" : "image/png,image/jpeg,image/webp"} disabled={busy} onChange={e => void upload(e.target.files?.[0])}/><div className="ose-media-actions"><button type="button" className="ose-file-label" disabled={busy} onClick={() => input.current?.click()}><Upload size={16}/>{busy ? (id ? "Mengunggah…" : "Uploading…") : (id ? "Unggah / ganti berkas" : "Upload / replace file")}</button><span className="text-xs text-muted-foreground">{bucket === "tenant-learning" ? "PNG, JPG, WebP, PDF, MP4 · 20 MB" : "PNG, JPG, WebP · 5 MB"}</span></div><p role="status" className="mt-2 text-sm">{message}</p></div>;
}
export function DeleteMedia({ bucket, path }: { bucket: MediaBucket; path: string }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const cache = useQueryClient();
  async function remove() {
    setBusy(true); setError("");
    const { error } = await createClient().storage.from(bucket).remove([path]);
    if (error) setError(id ? "Berkas gagal dihapus." : "Unable to delete file.");
    else { await cache.invalidateQueries({ queryKey: ["media"] }); setConfirm(false); if (bucket === "platform-media") window.dispatchEvent(new Event("osekola-brand-change")); }
    setBusy(false);
  }
  return <div className="ose-media-actions">{confirm ? <><span className="text-xs">{id ? "Hapus berkas ini?" : "Delete this file?"}</span><button disabled={busy} onClick={() => void remove()}>{id ? "Ya, hapus" : "Yes, delete"}</button><button disabled={busy} onClick={() => setConfirm(false)}>{id ? "Batal" : "Cancel"}</button></> : <button type="button" onClick={() => setConfirm(true)}><Trash2 size={15}/>{id ? "Hapus" : "Delete"}</button>}{error && <p role="alert">{error}</p>}</div>;
}
export function FixedMedia({ kind, userId }: { kind: "avatar" | "school" | "platform"; userId?: string }) {
  const { data: ctx, isLoading, error } = useMediaContext();
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const bucket = kind === "platform" ? "platform-media" : "tenant-media";
  const prefix = kind === "platform" ? "brand" : ctx?.tenant_id ? `${ctx.tenant_id}/${kind === "avatar" ? "avatars" : "logos"}` : undefined;
  const name = kind === "platform" ? "osekola-logo" : kind === "school" ? "logo" : userId ?? ctx?.user_id;
  const { data: files, error: listError } = useMediaEntries(bucket, prefix);
  const file = files?.find(f => f.name === name);
  if (isLoading) return <p>{id ? "Memuat media…" : "Loading media…"}</p>;
  if (error || listError) return <p role="alert">{id ? "Media belum dapat dimuat." : "Unable to load media."}</p>;
  const allowed = ctx && (kind === "platform" ? ctx.is_platform_admin : kind === "school" ? ctx.is_owner : ctx.is_owner || !userId || userId === ctx.user_id);
  if (!allowed || !prefix || !name) return null;
  return <section className="glass-panel rounded-3xl p-6 mb-6"><h2 className="text-lg font-semibold mb-4">{kind === "platform" ? "Logo OSEKOLA" : kind === "school" ? (id ? "Logo sekolah" : "School logo") : (id ? "Foto profil" : "Profile photo")}</h2><div className="ose-media-preview">{file ? <Image className="ose-private-image" unoptimized src={mediaUrl(bucket, `${prefix}/${name}`, file.updated_at)} alt={id ? "Pratinjau gambar" : "Image preview"} width={180} height={180}/> : <span className="ose-product-icon"><ImagePlus size={28}/></span>}<MediaUpload bucket={bucket} prefix={prefix} fixedName={name}/></div>{file && <DeleteMedia bucket={bucket} path={`${prefix}/${name}`}/>}</section>;
}
