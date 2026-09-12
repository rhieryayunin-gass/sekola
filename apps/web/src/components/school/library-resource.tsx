"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Download, X } from "lucide-react";
import { useTranslations } from "../i18n/i18n-provider";
import type { SchoolRow } from "../../lib/school";

export function youtubeEmbed(url: string) {
  const match = /^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&].*)?$/.exec(url);
  return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : null;
}

export function LibraryResource({ row }: { row: SchoolRow }) {
  const [open, setOpen] = useState(false);
  const { locale } = useTranslations(); const id = locale === "id-ID";
  const url = String(row.url ?? "");
  const video = row.kind === "YOUTUBE" ? youtubeEmbed(url) : null;
  const file = /^\/api\/media\/file\?/.test(url);
  if (!video && !file) return null;
  return <><button className="ose-link inline-flex items-center gap-2" onClick={() => setOpen(true)}><BookOpen size={15}/>{id ? "Buka materi" : "Open resource"}</button>{open && <ResourceDialog title={String(row.title)} close={() => setOpen(false)}>{video ? <iframe title={String(row.title)} src={video} className="school-library-video" allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/> : <a href={url} className="ose-cta" target="_blank" rel="noreferrer"><Download size={16}/>{id ? "Buka / unduh file" : "Open / download file"}</a>}{Boolean(row.description) && <p>{String(row.description)}</p>}</ResourceDialog>}</>;
}

function ResourceDialog({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { locale } = useTranslations();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="school-notification-dialog school-library-dialog" aria-labelledby="resource-title" onClose={close}><div className="school-section-title"><h2 id="resource-title">{title}</h2><button onClick={close} aria-label={locale === "id-ID" ? "Tutup" : "Close"}><X/></button></div>{children}</dialog>;
}
