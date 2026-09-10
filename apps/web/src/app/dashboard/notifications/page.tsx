import { NotificationCenter } from "../../../components/notifications/notification-center";
import { ModulePage } from "../../../components/layout/module-page";
export const metadata = { title: "Notifications" };
export default function Page() {
  return <ModulePage permission="notifications.read" title="notificationCenter" description="notificationsDesc"><NotificationCenter/></ModulePage>;
}
