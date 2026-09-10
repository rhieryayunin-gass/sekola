"use client";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "../i18n/i18n-provider";
import { modules } from "../../lib/modules";

export function Landing() {
  const { t } = useTranslations();
  return <main id="ose-main">
    <section className="ose-hero">
      <div><p className="ose-eyebrow"><span className="ose-brand-dot"/> {t("heroEyebrow")}</p><h1>{t("heroTitle")}<br/><span>{t("heroAccent")}</span></h1><p className="ose-hero-copy">{t("heroCopy")}</p><div className="ose-hero-actions"><Link className="ose-cta" href="/login">{t("enterWorkspace")} <span aria-hidden="true">↗</span></Link><a className="ose-link" href="#ecosystem">{t("exploreModules")} <span aria-hidden="true">→</span></a></div><div className="ose-hero-meta"><span>{t("forEveryRole")}</span><span>EN / ID</span></div></div>
      <div className="ose-brand-stage"><div className="ose-brand-art"><Image src="/brand/osekola.png" alt="OSEKOLA" width={1448} height={1086} priority sizes="(max-width: 760px) 90vw, 42vw" /></div><div className="ose-orbit-label">{t("connectedSchool")}</div><div className="ose-orbit-chips"><span>Academic+</span><span>Learning+</span><span>Team+</span></div></div>
    </section>
    <section className="ose-ecosystem" id="ecosystem"><div className="ose-section-heading"><div><p className="ose-eyebrow">{t("ecosystem")}</p><h2>{t("ecosystemHeading")}</h2></div><p>{t("ecosystemCopy")}</p></div><div className="ose-feature-grid">{modules.filter(m => !["users","tenant","people"].includes(m.key)).map(m => <article key={m.key} className="ose-feature glass-panel"><span className="ose-mark">{m.mark}</span><h3>{t(m.title)}</h3><p>{t(m.detail)}</p></article>)}</div></section>
    <section className="ose-landing-close"><p className="ose-eyebrow">OWNER · PRINCIPAL · STAFF · TEACHER · STUDENT · PARENT</p><h2>{t("closeHeading")}</h2><Link className="ose-cta" href="/login">{t("signIn")} <span aria-hidden="true">→</span></Link></section>
    <footer className="ose-footer"><span>osekola</span><span>{t("schoolPlatform")}</span></footer>
  </main>;
}
