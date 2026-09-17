"use client";
import { Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCenter, openCenter } from "../../stores/center-store";
import { LargeDialog } from "./large-dialog";
import { usePermissionStore } from "../../stores/permission-store";
import { useSchoolContext } from "../../lib/school";
import { useTranslations } from "../i18n/i18n-provider";
const CalendarManager = dynamic(() =>
  import("../calendar/calendar-manager").then((m) => m.CalendarManager),
);
const NotificationCenter = dynamic(() =>
  import("../notifications/notification-center").then(
    (m) => m.NotificationCenter,
  ),
);
const ConnectWorkspace = dynamic(() =>
  import("../connect/connect-workspace").then((m) => m.ConnectWorkspace),
);
type Center = "connect" | "calendar" | "notifications";
export function Centers() {
  return (
    <Suspense>
      <CenterContent />
    </Suspense>
  );
}
function CenterContent() {
  const { center, close } = useCenter();
  const context = usePermissionStore((s) => s.context);
  const school = useSchoolContext();
  const path = usePathname();
  const { t } = useTranslations();
  const permitted =
    !!context?.permissions.some((p) => p.code === `${center}.read`) &&
    (center !== "connect" || school.data?.settings.modules.connect !== false);
  if (!center || !path.startsWith("/dashboard") || !permitted) return null;
  return (
    <LargeDialog
      title={
        center === "connect"
          ? "O-Connect"
          : t(center === "calendar" ? "calendarCenter" : "notificationCenter")
      }
      close={close}
      kind={center}
    >
      {center === "connect" ? (
        <ConnectWorkspace />
      ) : center === "calendar" ? (
        <CalendarManager />
      ) : (
        <NotificationCenter />
      )}
    </LargeDialog>
  );
}
export function CenterRedirect({ center }: { center: Center }) {
  const router = useRouter();
  const params = useSearchParams();
  const conversation = params.get("conversation");
  useEffect(() => {
    openCenter(center, conversation ?? undefined);
    router.replace("/dashboard", { scroll: false });
  }, [center, conversation, router]);
  return null;
}
