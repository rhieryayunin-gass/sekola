"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "../i18n/i18n-provider";
import { marketingFaqs } from "../../lib/marketing-stories";

export function MarketingFaq() {
  const { locale } = useTranslations();
  const id = locale === "id-ID";
  const [open, setOpen] = useState<string | null>(null);
  return <section className="p6-faq" id="faq" aria-labelledby="faq-title">
    <div className="p6-centered-heading"><p className="ose-eyebrow">FAQ</p><h2 id="faq-title">{id ? "Ada pertanyaan? Mari kita jawab." : "Questions? Let's talk about them."}</h2><p>{id ? "Kenali OSEKOLA sebelum memulai perjalanan sekolah Anda." : "Get to know OSEKOLA before your school's next chapter."}</p></div>
    <div className="p6-faq-list">{marketingFaqs.map(faq => {
      const [question, answer] = id ? faq.id : faq.en;
      const expanded = open === faq.key;
      return <article key={faq.key} className="p6-faq-item" data-open={expanded}>
        <h3><button type="button" id={`faq-${faq.key}`} aria-expanded={expanded} aria-controls={`faq-answer-${faq.key}`} onClick={() => setOpen(expanded ? null : faq.key)}>{question}<Plus size={21} aria-hidden="true"/></button></h3>
        <div id={`faq-answer-${faq.key}`} role="region" aria-labelledby={`faq-${faq.key}`} hidden={!expanded}><p>{answer}</p></div>
      </article>;
    })}</div>
  </section>;
}
