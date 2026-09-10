import Image from "next/image";
import Link from "next/link";

export function Brand({ full = false }: { full?: boolean }) {
  return <Link href="/" className={full ? "ose-logo-full" : "ose-brand"} aria-label="osekola">
    {full ? <Image src="/brand/osekola.png" alt="OSEKOLA" width={1448} height={1086} priority /> : <>
      <span className="ose-logo-mark" aria-hidden="true"><Image src="/brand/osekola.png" alt="" width={1448} height={1086} priority /></span>
      <span>o<span className="ose-brand-accent">sekola</span></span>
    </>}
  </Link>;
}
