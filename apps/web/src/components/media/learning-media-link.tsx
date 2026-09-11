"use client";
import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { useTranslations } from "../i18n/i18n-provider";
export function LearningMediaLink() { const { locale } = useTranslations(); return <Link className="ose-contact-link mb-5" href="/dashboard/media?category=learning"><FolderOpen size={18}/>{locale === "id-ID" ? "Buka berkas pembelajaran" : "Open learning files"}</Link>; }
