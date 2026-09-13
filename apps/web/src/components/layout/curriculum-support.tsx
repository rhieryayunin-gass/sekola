"use client";
import Image from "next/image";
import {useTranslations} from "../i18n/i18n-provider";
const curricula=[
 ["Merdeka","FASE · CP · TP","https://kurikulum.kemendikdasmen.go.id/"],
 ["Kurikulum 2013","KI · KD","https://kurikulum.kemendikdasmen.go.id/"],
 ["Cambridge","PRIMARY → ADVANCED","https://www.cambridgeinternational.org/programmes-and-qualifications/"],
 ["IB","PYP · MYP · DP · CP","https://www.ibo.org/programmes/"],
 ["Pearson Edexcel","INTERNATIONAL","https://qualifications.pearson.com/en/qualifications.html"],
 ["IPC · IMYC","INTERNATIONAL CURRICULUM","https://internationalcurriculum.com/"],
 ["Montessori","INDIVIDUAL PROGRESS","https://montessori-ami.org/"],
 ["Singapore","SUBJECT SYLLABUSES","https://www.moe.gov.sg/education-in-sg"],
 ["US · AP","STANDARDS & COURSES","https://apcentral.collegeboard.org/courses"],
 ["Australian","LEARNING AREAS","https://www.australiancurriculum.edu.au/"],
 ["Madrasah","NASIONAL & KEAGAMAAN","https://pendis.kemenag.go.id/"],
] as const;
const logos:Record<string,string>={Merdeka:"merdeka.png",Cambridge:"cambridge.svg","Pearson Edexcel":"pearson.png"};
const marks:Record<string,[string,string]>={"Kurikulum 2013":["K13","#027aaf"],IB:["ib","#1688bd"],"IPC · IMYC":["ipc / imyc","#4d951e"],Montessori:["Montessori","#287b82"],Singapore:["SINGAPORE","#c83039"],"US · AP":["AP®","#202d38"],Australian:["AC","#b14086"],Madrasah:["MADRASAH","#17714e"]};
function CurriculumLogo({name}:{name:string}){const mark=marks[name];return logos[name]?<Image className="p5-curriculum-logo" src={`/curricula/${logos[name]}`} alt={name} width={220} height={70}/>:<svg className="p5-curriculum-logo" viewBox="0 0 220 70" role="img" aria-label={name}><rect x="2" y="5" width="216" height="60" rx="14" fill={mark[1]} fillOpacity="0.07"/><path d="M16 45V25l10 5 10-5v20l-10-5z" fill="none" stroke={mark[1]} strokeWidth="2"/><text x="123" y="44" textAnchor="middle" fill={mark[1]} fontSize={mark[0].length>9?17:25} fontWeight="700" fontFamily="Arial,sans-serif">{mark[0]}</text></svg>;}
export function CurriculumSupport(){const {locale}=useTranslations();const id=locale==="id-ID";return <section className="p5-curricula" id="curricula"><p className="ose-eyebrow">ONE SCHOOL, MANY LEARNING PATHS</p><h2>{id?"Beragam kurikulum. Satu sekolah yang terhubung.":"Multiple curricula. One connected school."}</h2><p>{id?"Jalankan Kurikulum Merdeka, Cambridge, dan program lainnya berdampingan dalam satu sekolah. Atur program per tahun ajaran, kelas, atau siswa—lengkap dengan fase, silabus, capaian belajar, dan skala penilaian masing-masing.":"Run Kurikulum Merdeka, Cambridge, and other programmes alongside each other in one school. Assign programmes by academic year, class, or student, with their own stages, syllabuses, learning outcomes, and grading scales."}</p><div className="p5-curriculum-badges">{curricula.map(([name,subtitle,href])=><a key={name} href={href} target="_blank" rel="noreferrer"><CurriculumLogo name={name}/><span className="p5-curriculum-wordmark">{name}</span><small>{!id&&subtitle==="NASIONAL & KEAGAMAAN"?"NATIONAL & RELIGIOUS":!id&&subtitle==="FASE · CP · TP"?"PHASES · CP · TP":subtitle}</small></a>)}</div><p>{id?"Program sekolah sendiri juga dapat dikonfigurasi. Hasil penilaian mempertahankan versi dan skala kurikulum saat diterbitkan.":"School-defined programmes can also be configured. Published results retain the curriculum version and grading scale used for assessment."}</p></section>;}
