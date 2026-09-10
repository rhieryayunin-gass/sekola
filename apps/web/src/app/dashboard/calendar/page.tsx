import { CalendarManager } from "../../../components/calendar/calendar-manager";
import { ModulePage } from "../../../components/layout/module-page";
export const metadata = { title: "Calendar" };
export default function Page() {
  return <ModulePage permission="calendar.read" title="calendarCenter" description="calendarDesc"><CalendarManager/></ModulePage>;
}
