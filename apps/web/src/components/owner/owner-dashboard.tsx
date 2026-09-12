"use client";
import { useTranslations } from "../i18n/i18n-provider";
import { amount, ownerNavigation, useOwnerSummary } from "../../lib/owner";
import { OwnerHeading, OwnerMetric, OwnerShell } from "./owner-ui";
import { Button } from "../ui";
export function OwnerDashboard() {
  const { t, locale } = useTranslations(); const q = useOwnerSummary();
  return <OwnerShell><OwnerHeading title="ownerOverview" description="ownerOverviewDesc"/>{q.isPending ? <p role="status">{t("loading")}</p> : q.isError ? <div role="alert"><p>{t("loadError")}</p><Button onClick={() => void q.refetch()}>{t("retry")}</Button></div> : <div className="owner-metrics owner-metrics-four">
    <OwnerMetric label={t("ownerTenant")} value={q.data.tenants.toLocaleString(locale)} detail={`${q.data.active_tenants} ${t("ownerActive")}`} href={ownerNavigation[1].href}/>
    <OwnerMetric label={t("ownerFinance")} value={amount(q.data.income, locale)} detail={`${t("ownerReceivables")}: ${amount(q.data.receivables, locale)}`} href={ownerNavigation[2].href}/>
    <OwnerMetric label={t("ownerPartner")} value={q.data.partners.toLocaleString(locale)} detail={`${q.data.active_partners} ${t("ownerActive")}`} href={ownerNavigation[3].href}/>
    <OwnerMetric label={t("ownerUser")} value={q.data.users.toLocaleString(locale)} detail={`${q.data.active_users} ${t("ownerActive")}`} href={ownerNavigation[4].href}/>
  </div>}</OwnerShell>;
}
