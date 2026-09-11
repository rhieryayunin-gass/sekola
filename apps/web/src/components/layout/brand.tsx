"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";

export function Brand({ full = false }: { full?: boolean }) {
  const [version, setVersion] = useState(0);
  useEffect(() => { const update = () => setVersion(Date.now()); window.addEventListener("osekola-brand-change", update); return () => window.removeEventListener("osekola-brand-change", update); }, []);
  return <Link href="/" className={full ? "ose-logo-full" : "ose-brand"} aria-label="osekola">
    {full ? <Image unoptimized src={`/api/brand?v=${version}`} alt="OSEKOLA" width={1448} height={1086} priority /> : <>
      <span className="ose-logo-mark" aria-hidden="true"><Image unoptimized src={`/api/brand?v=${version}`} alt="" width={1448} height={1086} priority /></span>
      <span>o<span className="ose-brand-accent">sekola</span></span>
    </>}
  </Link>;
}
