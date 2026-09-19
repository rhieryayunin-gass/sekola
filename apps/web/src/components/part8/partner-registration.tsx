"use client";
import { CheckCircle2, Upload } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "../i18n/i18n-provider";
import { Button, Input } from "../ui";
import { LargeDialog } from "./large-dialog";
export function PartnerRegistration() {
  const { locale } = useTranslations();
  const id = locale === "id-ID";
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [received, setReceived] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const file = f.get("cv") as File;
      if (!file || file.size > 1048576)
        throw new Error(
          id
            ? "CV harus berupa PDF maksimal 1 MB."
            : "CV must be a PDF up to 1 MB.",
        );
      const r = await fetch("/api/partners/register", {
        method: "POST",
        body: f,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setReceived(d.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to submit");
    } finally {
      setPending(false);
    }
  }
  return (
    <main id="ose-main" className="school-partner-public">
      <h1>{id ? "Mari tumbuh bersama OSEKOLA" : "Grow with OSEKOLA"}</h1>
      <LargeDialog
        title={id ? "Daftar sebagai mitra" : "Become a partner"}
        close={() => {
          if (!pending) router.push("/partners");
        }}
        kind="registration"
      >
        {received ? (
          <div className="p8-register-intro" role="status">
            <h2>
              {id
                ? "Pendaftaran Anda sudah diterima"
                : "Your application has been received"}
            </h2>
            <p>
              {id
                ? "Tim OSEKOLA akan menghubungi kandidat yang memenuhi kualifikasi melalui WhatsApp untuk wawancara online."
                : "OSEKOLA will contact qualified applicants on WhatsApp for an online interview."}
            </p>
            <small>
              {id ? "Referensi" : "Reference"}: {received}
            </small>
          </div>
        ) : (
          <>
            <div className="p8-register-intro">
              <ul>
                {(id
                  ? [
                      "Terbuka untuk semua kalangan yang ingin membantu sekolah berkembang.",
                      "Pendaftaran sepenuhnya gratis.",
                      "Kandidat yang memenuhi kualifikasi akan diundang untuk wawancara online.",
                      "Ketentuan kerja sama dijelaskan saat wawancara dan onboarding.",
                    ]
                  : [
                      "Open to everyone who wants to help schools grow.",
                      "Registration is completely free.",
                      "Qualified applicants will be invited to an online interview.",
                      "Partnership terms are explained during the interview and onboarding.",
                    ]
                ).map((s) => (
                  <li key={s}><CheckCircle2 size={18} aria-hidden="true"/>{s}</li>
                ))}
              </ul>
            </div>
            <form
              className="p8-form p10-partner-form"
              onSubmit={submit}
              style={{ marginTop: 24 }}
            >
              <Input
                name="name"
                label={id ? "Nama Lengkap" : "Full Name"}
                required
                minLength={2}
                maxLength={160}
              />
              <Input
                name="nik"
                label="NIK"
                required
                inputMode="numeric"
                pattern="[0-9]{16}"
                minLength={16}
                maxLength={16}
              />
              <Input
                name="phone"
                label={id ? "Nomor WhatsApp" : "WhatsApp Number"}
                type="tel"
                placeholder="62812…"
                required
                pattern="\+?[0-9]{8,16}"
              />
              <Input
                name="domicile"
                label={id ? "Kota / Kabupaten Domisili" : "City of Residence"}
                required
                minLength={2}
                maxLength={300}
              />
              <Input
                name="occupation"
                label={
                  id
                    ? "Pekerjaan / Kegiatan Saat Ini"
                    : "Current Occupation / Activity"
                }
                required
                minLength={2}
                maxLength={200}
              />
              <Input
                name="school_count"
                label={
                  id
                    ? "Jumlah Sekolah yang Anda Kenal (TK–SMA/Sederajat)"
                    : "Number of Schools You Know (Kindergarten–High School)"
                }
                type="number"
                min={0}
                max={100000}
                required
              />
              <Input name="estimated_students" type="number" min={0} max={10000000} required label={id ? "Perkiraan Total Siswa di Semua Sekolah yang Direferensikan" : "Estimated Total Students at Potential Referral Schools"}/>
              <label className="p8-full">
                {id
                  ? "Kontak Pengurus Sekolah — Nama, Sekolah, dan Jabatan"
                  : "School Contacts — Name, School, and Role"}
                <textarea
                  name="contacts"
                  required
                  minLength={2}
                  maxLength={3000}
                  rows={3}
                />
              </label>
              <div className="p8-full p10-upload"><span>{id ? "CV dengan Foto" : "CV with Photo"}</span><label className="ose-file-label"><Upload size={18}/>{fileName ? (id ? "Ganti Berkas" : "Replace File") : (id ? "Unggah Berkas" : "Upload File")}<input className="p10-file-input" type="file" name="cv" accept="application/pdf,.pdf" required aria-label={id ? "CV dengan foto" : "CV with photo"} onChange={e=>setFileName(e.target.files?.[0]?.name ?? "")}/></label><small>{fileName || "PDF · max 1 MB"}</small></div>
              <label className="p8-full school-consent">
                <input type="checkbox" name="photo_confirmed" required />
                {id
                  ? "Saya memastikan CV yang diunggah memuat foto saya."
                  : "I confirm that my CV includes my photo."}
              </label>
              <label className="p8-full school-consent">
                <input type="checkbox" name="consent" required />
                {id
                  ? "Saya setuju data ini digunakan oleh OSEKOLA untuk seleksi dan menghubungi saya terkait kemitraan."
                  : "I consent to OSEKOLA using this information for recruitment and contacting me about the partnership."}
              </label>
              <div hidden aria-hidden="true">
                <input name="website" tabIndex={-1} autoComplete="off" />
              </div>
              {error && (
                <p className="school-error p8-full" role="alert">
                  {error}
                </p>
              )}
              <Button className="p10-centered-submit" type="submit" disabled={pending}>
                {pending
                  ? id
                    ? "Mengirim…"
                    : "Submitting…"
                  : id
                    ? "Kirim Pendaftaran"
                    : "Submit Application"}
              </Button>
            </form>
          </>
        )}
      </LargeDialog>
    </main>
  );
}
