"use client";
import { useState } from "react";
import {
  useOwnerList,
  useOwnerSave,
  value,
  type OwnerRow,
} from "../../lib/owner";
import { useTranslations } from "../i18n/i18n-provider";
import { OwnerSwitch } from "../owner/owner-ui";
import { Button, Input } from "../ui";
export function SettlementAccounts({ tenantId }: { tenantId: string }) {
  const { locale } = useTranslations();
  const id = locale === "id-ID";
  const q = useOwnerList("settlement_accounts", { tenant_id: tenantId });
  const save = useOwnerSave();
  const [edit, setEdit] = useState<OwnerRow | null>();
  return (
    <section className="p8-section">
      <header>
        <div>
          <h3>
            {id ? "Rekening penerimaan sekolah" : "School settlement accounts"}
          </h3>
          <p>
            {id
              ? "Dikelola Owner. Maksimal satu rekening aktif."
              : "Managed by Owner. Only one account can be active."}
          </p>
        </div>
        <Button type="button" onClick={() => setEdit(null)}>
          {id ? "Tambah rekening" : "Add account"}
        </Button>
      </header>
      {q.isError && <p role="alert">{q.error.message}</p>}
      {q.data?.items.map((r) => (
        <div className="p8-account" key={r.id}>
          <div>
            <strong>
              {value(r, "bank_name")} · {value(r, "account_number")}
            </strong>
            <small>{value(r, "account_name")}</small>
          </div>
          <div className="owner-actions">
            <OwnerSwitch
              checked={r.is_active === true}
              label={`${id ? "Aktifkan rekening" : "Activate account"} ${value(r, "account_number")}`}
              disabled={save.isPending}
              onChange={() =>
                save.mutate({
                  kind: "settlement_account",
                  id: r.id,
                  payload: { is_active: !r.is_active },
                })
              }
            />
            <Button type="button" variant="ghost" onClick={() => setEdit(r)}>
              {id ? "Edit" : "Edit"}
            </Button>
          </div>
        </div>
      ))}
      {edit !== undefined && (
        <form
          className="p8-form"
          key={edit?.id ?? "new"}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save.mutate(
              {
                kind: "settlement_account",
                id: edit?.id,
                payload: {
                  tenant_id: tenantId,
                  bank_name: f.get("bank_name"),
                  account_name: f.get("account_name"),
                  account_number: f.get("account_number"),
                  is_active: f.get("active") === "on",
                },
              },
              { onSuccess: () => setEdit(undefined) },
            );
          }}
        >
          <Input
            name="bank_name"
            label={id ? "Nama bank" : "Bank name"}
            defaultValue={String(edit?.bank_name ?? "")}
            required
            maxLength={100}
          />
          <Input
            name="account_name"
            label={id ? "Nama pemilik rekening" : "Account holder"}
            defaultValue={String(edit?.account_name ?? "")}
            required
            maxLength={160}
          />
          <Input
            name="account_number"
            label={id ? "Nomor rekening" : "Account number"}
            defaultValue={String(edit?.account_number ?? "")}
            pattern="[0-9]{5,40}"
            inputMode="numeric"
            required
          />
          <label>
            <input
              type="checkbox"
              name="active"
              defaultChecked={edit?.is_active === true}
            />
            {id
              ? "Aktifkan (rekening aktif sebelumnya akan dinonaktifkan)"
              : "Activate (deactivates the previous active account)"}
          </label>
          <div className="owner-actions p8-full">
            <Button type="submit" disabled={save.isPending}>
              {id ? "Simpan" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEdit(undefined)}
            >
              {id ? "Batal" : "Cancel"}
            </Button>
          </div>
        </form>
      )}
      {save.isError && <p role="alert">{save.error.message}</p>}
    </section>
  );
}
