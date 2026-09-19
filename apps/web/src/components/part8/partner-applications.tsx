"use client";
import { useState } from "react";
import {
  useOwnerList,
  useOwnerSave,
  value,
  type OwnerRow,
} from "../../lib/owner";
import { schoolRpc } from "../../lib/school";
import { useTranslations } from "../i18n/i18n-provider";
import {
  OwnerDialog,
  OwnerTable,
  OwnerSearch,
  OwnerSwitch,
} from "../owner/owner-ui";
import { Button, Input, Select } from "../ui";
export function PartnerApplications() {
  const { locale } = useTranslations();
  const id = locale === "id-ID";
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [cv, setCv] = useState<OwnerRow>();
  const [selected, setSelected] = useState<OwnerRow>();
  const [nik, setNik] = useState("");
  const [error, setError] = useState("");
  const q = useOwnerList("applications", { query }, page);
  const save = useOwnerSave();
  return (
    <section className="p8-section">
      <header>
        <h2>{id ? "Pendaftaran mitra" : "Partner applications"}</h2>
      </header>
      <OwnerSearch
        query={query}
        setQuery={(v) => {
          setQuery(v);
          setPage(1);
        }}
      />
      <OwnerTable
        headers={
          id
            ? [
                "Nama",
                "Domisili",
                "WhatsApp",
                "Sekolah dikenal", "Estimasi Siswa", "CV",
                "Seleksi",
                "Aktif",
                "Action",
              ]
            : [
                "Name",
                "City",
                "WhatsApp",
                "Schools known", "Estimated Students", "CV",
                "Selection",
                "Active",
                "Action",
              ]
        }
        list={q.data}
        page={page}
        setPage={setPage}
        loading={q.isPending}
        error={q.isError}
        retry={() => void q.refetch()}
      >
        {q.data?.items.map((r) => (
          <tr key={r.id}>
            <td>{value(r, "name")}</td>
            <td>{value(r, "domicile")}</td>
            <td>{value(r, "phone")}</td>
            <td>{value(r, "school_count")}</td><td>{value(r, "estimated_students") || "—"}</td><td><Button variant="ghost" onClick={()=>setCv(r)}>{id ? "Lihat CV" : "View CV"}</Button></td>
            <td>{value(r, "status")}</td>
            <td>
              <OwnerSwitch
                checked={r.is_active === true}
                disabled={save.isPending}
                label={`${id ? "Keaktifan" : "Active"} ${value(r, "name")}`}
                onChange={() =>
                  save.mutate({
                    kind: "application",
                    id: r.id,
                    payload: { is_active: !r.is_active },
                  })
                }
              />
            </td>
            <td>
              <Button
                variant="ghost"
                onClick={() => {
                  setSelected(r);
                  setNik("");
                  setError("");
                }}
              >
                {id ? "Tinjau / edit" : "Review / edit"}
              </Button>
            </td>
          </tr>
        ))}
      </OwnerTable>
      {cv && <OwnerDialog wide title={`CV · ${value(cv,"name")}`} close={()=>setCv(undefined)}><iframe className="p10-pdf-viewer" title={`CV ${value(cv,"name")}`} src={`/api/partners/cv?id=${cv.id}&view=inline`}/><a className="ose-link" href={`/api/partners/cv?id=${cv.id}`}>{id ? "Unduh CV" : "Download CV"}</a></OwnerDialog>}
      {save.isError && <p role="alert">{save.error.message}</p>}
      {selected && (
        <OwnerDialog
          wide
          title={value(selected, "name")}
          close={() => setSelected(undefined)}
        >
          <div className="owner-actions">
            <button type="button" className="ose-link" onClick={()=>setCv(selected)}>
              {id ? "Lihat CV" : "View CV"}
            </button>
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  const d = await schoolRpc<{ nik: string }>(
                    "school_partner_document",
                    { application_id: selected.id },
                  );
                  setNik(d.nik);
                } catch {
                  setError(
                    id ? "NIK tidak dapat dimuat" : "Unable to load NIK",
                  );
                }
              }}
            >
              {id ? "Lihat NIK" : "View NIK"}
            </Button>
            <span>{nik || `••••••••••••${value(selected, "nik_last4")}`}</span>
          </div>
          <form
            className="p8-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              save.mutate(
                {
                  kind: "application",
                  id: selected.id,
                  payload: Object.fromEntries(f),
                },
                { onSuccess: () => setSelected(undefined) },
              );
            }}
          >
            {[
              ["name", "Nama lengkap", "Full name"],
              ["phone", "WhatsApp", "WhatsApp"],
              ["domicile", "Domisili", "City"],
              ["occupation", "Kegiatan / pekerjaan", "Occupation"],
              ["bank_name", "Nama bank", "Bank name"],
              ["bank_account_name", "Pemilik rekening", "Account holder"],
              ["bank_account_number", "Nomor rekening", "Account number"],
            ].map(([k, ind, en]) => (
              <Input
                key={k}
                name={k}
                label={id ? ind : en}
                defaultValue={value(selected, k)}
                required={["name", "phone", "domicile", "occupation"].includes(
                  k,
                )}
              />
            ))}
            <Input
              type="number"
              min={0}
              max={100000}
              name="school_count"
              label={id ? "Sekolah dikenal" : "Schools known"}
              defaultValue={value(selected, "school_count")}
            />
            <Input type="number" name="estimated_students" min={0} max={10000000} label={id ? "Estimasi Total Siswa" : "Estimated Total Students"} defaultValue={value(selected,"estimated_students")}/>
            <Select
              name="status"
              label={id ? "Tahap seleksi" : "Selection stage"}
              defaultValue={value(selected, "status")}
            >
              {["NEW", "REVIEW", "INTERVIEW", "ACCEPTED", "REJECTED"].map(
                (v, i) => (
                  <option key={v} value={v}>
                    {
                      (id
                        ? [
                            "Baru",
                            "Ditinjau",
                            "Wawancara",
                            "Diterima",
                            "Ditolak",
                          ]
                        : [
                            "New",
                            "Review",
                            "Interview",
                            "Accepted",
                            "Rejected",
                          ])[i]
                    }
                  </option>
                ),
              )}
            </Select>
            {[
              ["contacts", "Pengurus yang dikenal", "Known contacts"],
              ["referral_schools", "Sekolah referral", "Referred schools"],
              ["owner_notes", "Catatan Owner", "Owner notes"],
            ].map(([k, ind, en]) => (
              <label className="p8-full" key={k}>
                {id ? ind : en}
                <textarea
                  name={k}
                  defaultValue={value(selected, k)}
                  rows={3}
                  maxLength={k === "referral_schools" ? 10000 : 3000}
                />
              </label>
            ))}
            <p className="p8-full">
              {id
                ? "Aktifkan akun portal mitra melalui daftar mitra setelah proses onboarding selesai."
                : "Set up the partner portal account in the partner list after onboarding."}
            </p>
            {(save.isError || error) && (
              <p role="alert" className="p8-full">
                {save.error?.message || error}
              </p>
            )}
            <Button type="submit" disabled={save.isPending}>
              {id ? "Simpan perubahan" : "Save changes"}
            </Button>
          </form>
        </OwnerDialog>
      )}
    </section>
  );
}
