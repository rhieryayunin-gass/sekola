"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "../i18n/i18n-provider";
import { schoolRpc, useSchoolContext } from "../../lib/school";
import { amount, date, type OwnerRow } from "../../lib/owner";
import { OwnerHeading, OwnerStatus } from "./owner-ui";
import { Button } from "../ui";
export function Subscription() {
  const { t, locale } = useTranslations(); const school = useSchoolContext(); const q = useQuery({ queryKey: ["subscription", school.data?.tenant.id], enabled: !!school.data?.staff, queryFn: () => schoolRpc<{ contract: OwnerRow | null; invoices: OwnerRow[] }>("school_subscription") });
  if (school.isPending) return <p role="status">{t("loading")}</p>;
  if (!school.data?.staff) return <p>{t("accessLimited")}</p>;
  return <section><OwnerHeading title="ownerSubscription" description="ownerSubscriptionDesc"/>{q.isPending ? <p role="status">{t("loading")}</p> : q.isError ? <div role="alert"><p>{t("loadError")}</p><Button onClick={() => void q.refetch()}>{t("retry")}</Button></div> : <div className="owner-table-panel glass-panel"><div className="owner-table-scroll"><table className="owner-table"><thead><tr>{["ownerInvoice", "ownerPeriod", "ownerDueDate", "ownerAmount", "ownerBalance", "ownerStatus"].map(k => <th key={k}>{t(k as "ownerInvoice")}</th>)}</tr></thead><tbody>{q.data.invoices.map(row => <tr key={row.id}><td>{String(row.number)}<small>{String(row.notes || "")}</small></td><td>{date(row.period_start, locale)} – {date(row.period_end, locale)}</td><td>{date(row.due_on, locale)}</td><td>{amount(row.amount, locale)}</td><td>{amount(row.balance, locale)}</td><td><OwnerStatus status={row.status}/></td></tr>)}</tbody></table></div>{!q.data.invoices.length && <p className="owner-empty">{t("ownerNoInvoice")}</p>}</div>}</section>;
}
