"use client";
import Image from "next/image";
import { useTranslations } from "../i18n/i18n-provider";

const curricula = [
  { name: "Kurikulum Merdeka", subtitle: ["FASE · CP · TP", "PHASES · CP · TP"], logo: "merdeka.png", href: "https://kurikulum.kemendikdasmen.go.id/" },
  { name: "Cambridge", subtitle: ["PRIMARY → ADVANCED", "PRIMARY → ADVANCED"], logo: "cambridge-clean.webp", href: "https://www.cambridgeinternational.org/programmes-and-qualifications/" },
  { name: "Pearson Edexcel", subtitle: ["INTERNASIONAL", "INTERNATIONAL"], logo: "pearson-clean.webp", href: "https://qualifications.pearson.com/en/qualifications.html" },
  { name: "IB", subtitle: ["PYP · MYP · DP · CP", "PYP · MYP · DP · CP"], logo: "ib-clean.webp", href: "https://www.ibo.org/programmes/" },
] as const;

export function CurriculumSupport() {
  const { locale } = useTranslations();
  const id = locale === "id-ID";
  return <section className="p5-curricula p6-curricula" id="curricula" aria-labelledby="curricula-title">
    <p className="ose-eyebrow">{id ? "SATU SEKOLAH, BERAGAM JALUR BELAJAR" : "ONE SCHOOL, MANY LEARNING PATHS"}</p>
    <h2 id="curricula-title">{id ? "Beragam kurikulum. Satu sekolah yang terhubung." : "Multiple curricula. One connected school."}</h2>
    <p>{id ? "Jalankan Kurikulum Merdeka, Cambridge, Pearson Edexcel, dan IB berdampingan. Atur program per tahun ajaran, kelas, atau siswa, lengkap dengan capaian belajar dan skala penilaian masing-masing." : "Run Kurikulum Merdeka, Cambridge, Pearson Edexcel, and IB alongside each other. Organize programmes by academic year, class, or student, each with its own learning outcomes and grading scales."}</p>
    <div className="p5-curriculum-badges">{curricula.map(curriculum => <a key={curriculum.name} href={curriculum.href} target="_blank" rel="noreferrer">
      <Image className="p5-curriculum-logo" src={`/curricula/${curriculum.logo}`} alt={curriculum.name} width={440} height={140}/>
      <span className="p5-curriculum-wordmark">{curriculum.name}</span><small>{curriculum.subtitle[id ? 0 : 1]}</small>
    </a>)}</div>
    <p className="p6-curriculum-note">{id ? "Hasil penilaian mempertahankan versi kurikulum dan skala penilaian saat diterbitkan." : "Published results retain the curriculum version and grading scale used for assessment."}</p>
  </section>;
}
