"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "../i18n/i18n-provider";
export function LargeDialog({
  title,
  children,
  close,
  kind = "center",
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  kind?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const label = useId();
  const { locale } = useTranslations();
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    el?.showModal();
    return () => {
      el?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`p8-dialog p8-dialog-${kind}`}
      aria-labelledby={label}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id={label}>{title}</h2>
        <button
          className="school-icon-link"
          type="button"
          onClick={close}
          aria-label={locale === "id-ID" ? "Tutup" : "Close"}
        >
          <X size={22} />
        </button>
      </header>
      <div className="p8-dialog-body">{children}</div>
    </dialog>
  );
}
