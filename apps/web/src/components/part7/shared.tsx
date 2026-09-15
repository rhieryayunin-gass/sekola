"use client";
import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "../i18n/i18n-provider";
import translations from "./translations.json";
import { useQueryClient } from "@tanstack/react-query";
import { usePermissionStore } from "../../stores/permission-store";
export function useP7() {
  const { locale } = useTranslations();
  return useCallback(
    (en: string, id?: string) =>
      locale === "id-ID"
        ? ((translations as Record<string, string>)[en] ?? id ?? en)
        : en,
    [locale],
  );
}
export function useActor() {
  return usePermissionStore((s) => s.context?.userId);
}
export function useRefresh() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all(
      [
        "p7",
        "school-records",
        "school-catalog",
        "school-exams",
        "school-context",
        "family-report",
        "notifications",
        "question-bank",
        "users",
      ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
    );
  };
}
export function ErrorNotice({ error }: { error?: unknown }) {
  return error ? (
    <p className="p7-error" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ) : null;
}
export function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="p7-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function textData(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries());
}
export function cleanData(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v === "" ? null : v]),
  );
}

export function FocusPanel({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    tr = useP7();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      className="p7-detail"
      ref={ref}
      aria-label={tr("Workspace details")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
