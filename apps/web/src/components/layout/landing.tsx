"use client";
import Image from "next/image";
import Link from "next/link";
import { Pricing } from "../school/growth-public";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, BookOpen, CalendarCheck, Check, ClipboardCheck, GraduationCap, Layers3, Mail, MapPin, MessageCircle, Phone, Users, Wallet, X } from "lucide-react";
import { useTranslations } from "../i18n/i18n-provider";
import { marketingCopy, marketingModules } from "../../lib/marketing";

const icons = { core: Layers3, academic: GraduationCap, attendance: CalendarCheck, learning: BookOpen, exam: ClipboardCheck, finance: Wallet, team: Users, connect: MessageCircle };
type MarketingModule = typeof marketingModules[number];
function ModuleDetails({ module, close }: { module: MarketingModule; close: () => void }) {
  const { locale } = useTranslations();
  const copy = marketingCopy[locale];
  const content = locale === "id-ID" ? module.idCopy : module.enCopy;
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={dialog} className="ose-module-dialog" aria-labelledby="module-title" aria-describedby="module-description" onClose={close} onClick={event => { if (event.target === dialog.current) { const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}>
    <button autoFocus className="ose-dialog-close ose-control" aria-label={copy.close} onClick={close}><X size={20}/></button>
    <div className="ose-dialog-art"><Image src={`/illustrations/${module.id}.webp`} alt="" width={1536} height={1024} sizes="(max-width: 760px) 90vw, 400px"/></div>
    <div className="ose-dialog-content"><span className="ose-eyebrow">{module.name}</span><h2 id="module-title">{content[0]}</h2><p id="module-description">{content[1]}</p><h3>{copy.features}</h3><ul>{content.slice(2).map(feature => <li key={feature}><Check size={18} aria-hidden="true"/>{feature}</li>)}</ul></div>
  </dialog>;
}
export function Landing() {
  const { locale } = useTranslations();
  const copy = marketingCopy[locale];
  const [selected, setSelected] = useState<MarketingModule | null>(null);
  return <main id="ose-main" className="ose-marketing">
    <section className="ose-hero ose-hero-new"><div className="ose-hero-text"><h1>{copy.title}<br/><span>{copy.accent}</span></h1><p className="ose-hero-copy">{copy.intro}</p><div className="school-hero-actions"><a className="ose-contact-link" href="#contact">{copy.contact}<ArrowDown size={18}/></a><Link className="ose-link" href="/assessment">{locale === "id-ID" ? "Cek kesiapan digital sekolah" : "Assess your school's digital readiness"}<ArrowUpRight size={18}/></Link></div></div><div className="ose-school-scene"><Image src="/illustrations/hero.webp" alt={locale === "id-ID" ? "Guru dan siswa terhubung dalam lingkungan sekolah digital" : "A teacher and students connected in a digital school"} width={1536} height={1024} preload sizes="(max-width: 760px) 100vw, 55vw"/></div></section>
    <section className="ose-ecosystem" id="ecosystem"><div className="ose-section-heading"><div><p className="ose-eyebrow">OSEKOLA ECOSYSTEM</p><h2>{copy.modules}</h2></div><span className="ose-section-hint">{copy.moduleHint}</span></div><div className="ose-product-grid">{marketingModules.map(module => { const Icon = icons[module.icon]; const content = locale === "id-ID" ? module.idCopy : module.enCopy; return <button type="button" key={module.id} className="ose-product-card glass-panel" aria-haspopup="dialog" onClick={() => setSelected(module)}><span className="ose-product-icon"><Icon size={26} strokeWidth={1.7}/></span><h3>{module.name}</h3><p>{content[1]}</p><span className="ose-card-action">{copy.details}<ArrowUpRight size={18}/></span></button>; })}</div></section>
    <Pricing/>
    <section className="ose-people-close"><p className="ose-eyebrow">TEACHER · STUDENT · PARENT</p><h2>{copy.closing}</h2><p>{copy.closingCopy}</p><div aria-hidden="true" className="ose-people-symbols"><GraduationCap/><span/><BookOpen/><span/><Users/></div></section>
    <footer className="ose-footer-new" id="contact"><div className="ose-footer-top"><div><p className="ose-eyebrow">LET’S CONNECT</p><h2>{copy.contactTitle}</h2><p>{copy.contactCopy}</p></div><address><a href="tel:+6285110511078"><Phone size={18}/>085110511078</a><a href="mailto:marketing@osekola.com"><Mail size={18}/>marketing@osekola.com</a></address></div><div className="ose-footer-company"><div><strong>PT Aplikasi Layanan Belajar Indonesia</strong><p><MapPin size={17}/><span>{copy.office}: Wangsa Serpong,<br/>Tangerang Selatan, Indonesia</span></p></div><div className="ose-store-badges"><span>{copy.soon}</span><div><span className="ose-store-badge"><svg aria-hidden="true" width="25" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.07 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 3-2.55 4.08ZM12.03 7.25C11.88 5.02 13.69 3.19 15.77 3c.3 2.57-2.33 4.5-3.74 4.25Z"/></svg>App Store</span><span className="ose-store-badge"><svg aria-hidden="true" width="24" height="28" viewBox="0 0 24 28"><path fill="#34a853" d="M2 1 16 9 12 14Z"/><path fill="#4285f4" d="M2 1v26l10-13Z"/><path fill="#fbbc04" d="m16 9 7 4v2l-7 4-4-5Z"/><path fill="#ea4335" d="M2 27 16 19l-4-5Z"/></svg>Google Play</span></div></div></div><div className="ose-footer-bottom"><span>© 2026 OSEKOLA. {copy.rights}</span><span>Made for learning. Built for connection.</span></div></footer>
    {selected && <ModuleDetails module={selected} close={() => setSelected(null)}/>}
  </main>;
}
