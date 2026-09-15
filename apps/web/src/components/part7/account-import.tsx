"use client";
import Link from "next/link";
import { usePermissionStore } from "../../stores/permission-store";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { browserApi } from "../../lib/api/browser";
import { schoolRpc, useCatalog } from "../../lib/school";
import { parseSchoolFile } from "../../lib/school-import";
import { Button, Input, Select } from "../ui";
import { ErrorNotice, useActor, useP7, useRefresh } from "./shared";
type Account = {
  id: string;
  email: string;
  is_active: boolean;
  user_level_id: string;
};
type ImportRow = {
  full_name: string;
  email: string;
  number: string;
  existing?: Account;
  error?: string;
};
export function AccountImport() {
  const tr = useP7(),
    actor = useActor(),
    refresh = useRefresh();
  const allowed = usePermissionStore(
    (s) => s.has("users.create") && s.has("users.read"),
  );
  const [role, setRole] = useState("STUDENT"),
    [data, setData] = useState<string[][]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [parseError, setParseError] = useState(""),
    [preview, setPreview] = useState<ImportRow[] | null>(null),
    [completed, setCompleted] = useState(0);
  const levels = useQuery({
    queryKey: ["p7", "import-levels", actor],
    enabled: allowed,
    queryFn: () =>
      browserApi<{ id: string; code: string; name: string }[]>(
        "/users/meta/user-levels",
      ),
  });
  const teachers = useCatalog("teachers"),
    students = useCatalog("students");
  const fields = [
    ["full_name", tr("Full name")],
    ["email", tr("Email")],
    [
      "number",
      role === "TEACHER" ? tr("Employee number") : tr("Student number"),
    ],
  ];
  const level = levels.data?.find((l) => l.code === role);
  const lookup = async (email: string) => {
    const r = await browserApi<{ items: Account[] }>(
      `/users?email=${encodeURIComponent(email)}&page=1&page_size=100`,
    );
    return r.items.find((a) => a.email.toLowerCase() === email);
  };
  const validate = useMutation({
    mutationFn: async () => {
      const rows = data
        .slice(1)
        .map((row) => ({
          full_name: row[Number(mapping.full_name)]?.trim() ?? "",
          email: row[Number(mapping.email)]?.trim().toLowerCase() ?? "",
          number: row[Number(mapping.number)]?.trim() ?? "",
        }));
      const seen = new Set<string>(),
        numbers = new Set<string>();
      const result: ImportRow[] = [];
      for (const row of rows) {
        let error = "";
        if (!level) error = tr("Choose an assignable role.");
        else if (
          row.full_name.length < 2 ||
          row.full_name.length > 160 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)
        )
          error = tr("Check name and email.");
        else if (seen.has(row.email))
          error = tr("Duplicate email in this file.");
        else if (
          ["STUDENT", "TEACHER"].includes(role) &&
          (!row.number || numbers.has(row.number))
        )
          error = tr("Missing or duplicate profile number.");
        seen.add(row.email);
        numbers.add(row.number);
        const existing = error ? undefined : await lookup(row.email);
        if (
          existing &&
          (!existing.is_active || existing.user_level_id !== level?.id)
        )
          error = tr(
            "Existing account has another role or is inactive; review in Accounts.",
          );
        result.push({ ...row, existing, error });
      }
      return result;
    },
    onSuccess: (rows) => setPreview(rows),
  });
  const commit = useMutation({
    mutationFn: async () => {
      if (!preview || preview.some((r) => r.error) || !level)
        throw new Error("Validate the account preview first");
      setCompleted(0);
      for (const row of preview) {
        const existing = await lookup(row.email);
        if (
          existing &&
          (!existing.is_active || existing.user_level_id !== level.id)
        )
          throw new Error(
            `${row.email}: ${tr("Account changed; review before continuing.")}`,
          );
        const account =
          existing ??
          (await browserApi<Account>("/users", {
            method: "POST",
            body: JSON.stringify({
              email: row.email,
              full_name: row.full_name,
              user_level_id: level.id,
            }),
          }));
        if (["STUDENT", "TEACHER"].includes(role)) {
          const resource = role === "STUDENT" ? "students" : "teachers";
          const r = await schoolRpc<{
            valid: boolean;
            errors?: { message: string }[];
          }>("school_setup_profile", {
            resource,
            person_id: account.id,
            identifier: row.number,
          });
          if (!r.valid)
            throw new Error(
              `${row.email}: ${r.errors?.map((e) => e.message).join("; ")}`,
            );
        }
        setCompleted((n) => n + 1);
      }
      await refresh();
    },
  });
  if (!allowed)
    return (
      <p className="p7-note">
        {tr(
          "Account creation is handled by your account administrator. Import school profiles below after the accounts are ready.",
        )}{" "}
        <Link href="/dashboard/connect">
          {tr("Contact your school team")} ↗
        </Link>
      </p>
    );
  return (
    <details className="p7-import">
      <summary>{tr("Import people from names and emails")}</summary>
      <p>
        {tr(
          "Create accounts and their student or teacher profiles together. Matching accounts are reused. Existing roles and profiles are reviewed, never overwritten.",
        )}
      </p>
      <Select
        label={tr("Role for this file")}
        value={role}
        disabled={commit.isPending}
        onChange={(e) => {
          setRole(e.target.value);
          setPreview(null);
          commit.reset();
        }}
      >
        {levels.data
          ?.filter((l) =>
            ["STUDENT", "TEACHER", "PARENT", "STAFF", "PRINCIPAL"].includes(
              l.code,
            ),
          )
          .map((l) => (
            <option key={l.id} value={l.code}>
              {l.name}
            </option>
          ))}
      </Select>
      <Input
        type="file"
        accept=".csv,.xlsx"
        disabled={commit.isPending}
        aria-label={tr("People spreadsheet")}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setParseError("");
          setPreview(null);
          commit.reset();
          try {
            const rows = await parseSchoolFile(f);
            setData(rows);
            setMapping(
              Object.fromEntries(
                fields.map(([key]) => [
                  key,
                  String(
                    Math.max(
                      0,
                      rows[0]?.findIndex((h) => h.toLowerCase() === key) ?? 0,
                    ),
                  ),
                ]),
              ),
            );
          } catch (error) {
            setParseError(
              error instanceof Error ? error.message : String(error),
            );
          }
        }}
      />
      <ErrorNotice
        error={parseError || levels.error || validate.error || commit.error}
      />
      {data.length > 1 && (
        <>
          <div className="p7-form-grid">
            {fields
              .filter(
                ([key]) =>
                  key !== "number" || ["STUDENT", "TEACHER"].includes(role),
              )
              .map(([key, label]) => (
                <Select
                  key={key}
                  label={label}
                  value={mapping[key] ?? "0"}
                  disabled={commit.isPending}
                  onChange={(e) => {
                    setMapping((v) => ({ ...v, [key]: e.target.value }));
                    setPreview(null);
                  }}
                >
                  {data[0].map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </Select>
              ))}
          </div>
          <Button
            disabled={validate.isPending || commit.isPending}
            onClick={() => validate.mutate()}
          >
            {validate.isPending
              ? tr("Checking accounts…")
              : tr("Preview accounts and profiles")}
          </Button>
        </>
      )}
      {preview && (
        <>
          <div className="p7-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{tr("Name")}</th>
                  <th>Email</th>
                  <th>{tr("Preview")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td>{r.full_name}</td>
                    <td>{r.email}</td>
                    <td className={r.error ? "p7-warning" : ""}>
                      {r.error ||
                        (r.existing
                          ? tr("Reuse matching account")
                          : tr("Create account"))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            {tr(
              "Accounts are created in order. If a row fails, completed rows stay saved; fix the file and retry to reuse them. No invitation message is sent.",
            )}
          </p>
          <Button
            disabled={
              preview.some((r) => r.error) ||
              commit.isPending ||
              commit.isSuccess
            }
            onClick={() => commit.mutate()}
          >
            {tr("Import reviewed people")}
          </Button>
          <p role="status">
            {completed} / {preview.length} {tr("completed")}
          </p>
        </>
      )}
      <small>
        {tr("Existing profiles")}: {students.data?.length ?? 0} {tr("students")}{" "}
        · {teachers.data?.length ?? 0} {tr("teachers")}
      </small>
    </details>
  );
}
