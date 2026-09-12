import { ModulePage } from "../../../components/layout/module-page";
import Link from "next/link";
import { RecordWorkspace, SchoolHierarchy } from "../../../components/school/record-workspace";
import { peopleSpecs } from "../../../components/school/resource-specs";
export const metadata = { title: "O-Core" };
export default function CorePage() { return <ModulePage name="core" title="people" description="peopleDesc"><div className="school-module-hero"><div><p className="ose-eyebrow">SCHOOL FOUNDATION</p><h1>O-Core</h1><p>Satu rumah untuk komunitas dan sumber daya sekolah.</p></div></div><SchoolHierarchy/><nav className="school-quick-links"><Link href="/dashboard/users">Akun & staf →</Link><Link href="/dashboard/tenant">Pengaturan sekolah →</Link><Link href="/dashboard/operations">Pemesanan & persetujuan →</Link><Link href="/dashboard/media">Logo & galeri →</Link></nav><RecordWorkspace specs={peopleSpecs}/></ModulePage>; }
