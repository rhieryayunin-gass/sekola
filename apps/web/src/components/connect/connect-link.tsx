"use client";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { usePermissionStore } from "../../stores/permission-store";
import { useTranslations } from "../i18n/i18n-provider";
export function ConnectLink({ kind, sourceId }: { kind: "class" | "project"; sourceId: string }) {
  const has = usePermissionStore(s => s.has);
  const { locale } = useTranslations();
  if (!has("connect.read")) return null;
  return <Link className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-secondary" href={`/dashboard/connect?${kind}=${encodeURIComponent(sourceId)}`}><MessageCircle size={17}/>{locale === "id-ID" ? "Diskusi O-Connect" : "O-Connect discussion"}</Link>;
}
