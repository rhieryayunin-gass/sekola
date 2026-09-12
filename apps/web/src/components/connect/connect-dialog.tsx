"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "../i18n/i18n-provider";

export function ConnectDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const { locale } = useTranslations();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="oc-dialog" aria-labelledby={id} onCancel={onClose}>
    <header><h2 id={id}>{title}</h2><button type="button" className="oc-icon" aria-label={locale === "id-ID" ? "Tutup" : "Close"} onClick={onClose}><X size={20}/></button></header>
    {children}
  </dialog>;
}
