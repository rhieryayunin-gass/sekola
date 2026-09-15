"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { BrandIcon } from "./brand-icon";
import { useTranslations } from "../i18n/i18n-provider";
import { marketingCopy, marketingModules } from "../../lib/marketing";
import { moduleStories } from "../../lib/marketing-stories";

export function ModuleShowcase({ onSelect }: { onSelect: (module: typeof marketingModules[number]) => void }) {
  const { locale } = useTranslations();
  const [active, setActive] = useState("o-attendance");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const copy = marketingCopy[locale];
  return <section className="ose-ecosystem p6-ecosystem" id="ecosystem" aria-labelledby="ecosystem-title">
    <div className="p6-centered-heading"><p className="ose-eyebrow">{locale === "id-ID" ? "EKOSISTEM OSEKOLA" : "OSEKOLA ECOSYSTEM"}</p><h2 id="ecosystem-title">{copy.modules}</h2><p>{copy.moduleHint}</p></div>
    <div className="p6-module-showcase">
      {marketingModules.map((module, index) => {
        const story = moduleStories[module.id];
        const content = locale === "id-ID" ? story.id : story.en;
        return <button type="button" key={module.id} ref={element => { buttons.current[index] = element; }}
          className="p6-module-story" data-active={active === module.id} aria-haspopup="dialog" aria-label={`${module.name}: ${content[0]} ${copy.details}`}
          onPointerEnter={event => { if (event.pointerType !== "touch") setActive(module.id); }} onFocus={() => setActive(module.id)} onClick={() => onSelect(module)}
          onKeyDown={event => {
            const next = event.key === "ArrowRight" ? (index + 1) % marketingModules.length : event.key === "ArrowLeft" ? (index - 1 + marketingModules.length) % marketingModules.length : event.key === "Home" ? 0 : event.key === "End" ? marketingModules.length - 1 : null;
            if (next !== null) { event.preventDefault(); buttons.current[next]?.focus(); }
          }}>
          <Image src={`/images/modules/${module.id}.webp`} alt="" fill sizes="(max-width: 760px) 88vw, 560px" style={{ objectPosition: story.position }}/>
          <span className="p6-module-name"><BrandIcon name={module.icon} size={23}/><span>{module.name}</span></span>
          <span className="p6-story-content"><span className="p6-story-feature">{content[1]}</span><strong>{content[0]}</strong><span className="p6-story-cta">{copy.details}<ArrowUpRight size={20} aria-hidden="true"/></span></span>
        </button>;
      })}
    </div>
  </section>;
}
