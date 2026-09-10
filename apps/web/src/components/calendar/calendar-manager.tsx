"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { browserApi } from "../../lib/api/browser";
import { usePermissionStore } from "../../stores/permission-store";
import { useTranslations } from "../i18n/i18n-provider";
import { Button, Card, EmptyState, Input, Select, useToast } from "../ui";

type Calendar = { id: string; name: string; is_active: boolean };
type Event = { id: string; title: string; starts_at: string; ends_at: string | null; event_type: string };
const dateKey = (date: Date) => [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-");
export function CalendarManager() {
  const { t, locale } = useTranslations();
  const client = useQueryClient();
  const { toast } = useToast();
  const has = usePermissionStore(s => s.has);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()));
  const [calendarId, setCalendarId] = useState("");
  const calendars = useQuery({ queryKey: ["calendars"], queryFn: () => browserApi<Calendar[]>("/calendars") });
  const activeId = calendarId || calendars.data?.find(c => c.is_active)?.id || calendars.data?.[0]?.id;
  const events = useQuery({ enabled: Boolean(activeId), queryKey: ["calendar-events", activeId], queryFn: () => browserApi<Event[]>("/calendars/" + activeId + "/events") });
  const [form, setForm] = useState<"calendar" | "event" | null>(null);
  const create = useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) => browserApi<Calendar>(path, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async (_, variables) => { if (variables.path === "/calendars") setCalendarId(""); await Promise.all([client.invalidateQueries({ queryKey: ["calendars"] }), client.invalidateQueries({ queryKey: ["calendar-events"] }), client.invalidateQueries({ queryKey: ["dashboard-calendars"] })]); setForm(null); toast({ title: t("saved"), tone: "success" }); },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate(form === "calendar" ? { path: "/calendars", body: { name: data.get("name") } } : { path: "/calendars/" + activeId + "/events", body: { title: data.get("title"), starts_at: new Date(String(data.get("starts_at"))).toISOString(), event_type: "GENERAL" } });
  }
  const startOffset = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate();
  const dayEvents = (events.data ?? []).filter(e => dateKey(new Date(e.starts_at)) === selectedDay).sort((a,b) => a.starts_at.localeCompare(b.starts_at));
  return <section>
    <div className="ose-calendar-controls">
      <Select aria-label={t("chooseCalendar")} value={activeId ?? ""} onChange={e => setCalendarId(e.target.value)}><option value="" disabled>{t("chooseCalendar")}</option>{calendars.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      {has("calendar.create") && <><Button variant="ghost" onClick={() => { setForm("calendar"); create.reset(); }}>{t("createCalendar")}</Button><Button disabled={!activeId} onClick={() => { setForm("event"); create.reset(); }}>{t("createEvent")}</Button></>}
    </div>
    {(calendars.isError || events.isError) && <div role="alert" className="ose-status glass-panel"><p>{t("loadError")}</p><Button onClick={() => { void calendars.refetch(); if(activeId) void events.refetch(); }}>{t("retry")}</Button></div>}
    {calendars.isLoading ? <p role="status">{t("loading")}</p> : <div className="ose-calendar-grid"><Card>
      <div className="ose-calendar-controls"><h2 className="mr-auto text-lg font-medium">{month.toLocaleDateString(locale, {month:"long",year:"numeric"})}</h2><Button aria-label={t("previousMonth")} variant="ghost" onClick={() => setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>←</Button><Button variant="ghost" onClick={() => { const now=new Date(); setMonth(new Date(now.getFullYear(),now.getMonth(),1)); setSelectedDay(dateKey(now)); }}>{t("today")}</Button><Button aria-label={t("nextMonth")} variant="ghost" onClick={() => setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>→</Button></div>
      <div className="ose-month">{Array.from({length:7},(_,i)=><span className="ose-weekday" key={i}>{new Date(2026,5,1+i).toLocaleDateString(locale,{weekday:"short"})}</span>)}{Array.from({length:Math.ceil((startOffset+days)/7)*7},(_,i)=>{
        const day=i-startOffset+1; const valid=day>0&&day<=days;
        const key=dateKey(new Date(month.getFullYear(),month.getMonth(),day)); const inDay=(events.data??[]).filter(e=>dateKey(new Date(e.starts_at))===key);
        return <button key={i} className="ose-day" disabled={!valid} data-today={key===dateKey(new Date())} aria-pressed={key===selectedDay} aria-label={new Date(month.getFullYear(),month.getMonth(),day).toLocaleDateString(locale,{dateStyle:"full"})+(inDay.length?" · "+inDay.length+" "+t("events"):"")} onClick={()=>setSelectedDay(key)}>{valid&&<><span>{day}</span>{inDay.slice(0,2).map(e=><small className="ose-event-dot" key={e.id}>{e.title}</small>)}{inDay.length>2&&<small>+{inDay.length-2}</small>}</>}</button>;
      })}</div></Card><div className="ose-aside"><Card><h2 className="font-medium">{new Date(selectedDay+"T12:00:00").toLocaleDateString(locale,{dateStyle:"long"})}</h2>{events.isLoading?<p className="mt-3" role="status">{t("loading")}</p>:dayEvents.length?dayEvents.map(e=><article className="ose-event-detail" key={e.id}><strong>{e.title}</strong><p>{new Date(e.starts_at).toLocaleTimeString(locale,{hour:"2-digit",minute:"2-digit"})}{e.ends_at?" – "+new Date(e.ends_at).toLocaleTimeString(locale,{hour:"2-digit",minute:"2-digit"}):""}</p></article>):!events.isError&&<div className="mt-4"><EmptyState title={t("events")} description={activeId?t("noEvents"):t("noCalendar")}/></div>}</Card>
      {form&&<Card><h2 className="mb-4 font-medium">{t(form==="calendar"?"createCalendar":"createEvent")}</h2><form key={form} className="grid gap-4" onSubmit={submit}>{form==="calendar"?<Input label={t("calendarName")} name="name" required maxLength={160}/>:<><Input label={t("eventTitle")} name="title" required maxLength={200}/><Input label={t("eventStart")} name="starts_at" type="datetime-local" defaultValue={selectedDay+"T08:00"} required/></>}{create.isError&&<p role="alert" className="text-danger">{create.error.message}</p>}<div className="flex gap-2"><Button type="submit" disabled={create.isPending}>{t("create")}</Button><Button variant="ghost" onClick={()=>setForm(null)}>{t("cancel")}</Button></div></form></Card>}</div></div>}
  </section>;
}
