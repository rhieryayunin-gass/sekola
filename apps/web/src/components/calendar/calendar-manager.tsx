"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { createClient } from "../../lib/supabase/client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Input } from "../ui/input";
import { useToast } from "../ui/toast";

type Calendar = { id: string; name: string; description: string | null; is_active: boolean };
type Event = { id: string; title: string; starts_at: string; ends_at: string | null; is_all_day: boolean; event_type: string; recurrence_rule: string | null; requires_approval: boolean };

function baseUrl() {
  const value = process.env.NEXT_PUBLIC_API_URL;
  if (!value) throw new Error("Public API configuration is missing");
  return value.replace(/\/$/, "");
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await createClient().auth.getSession();
  if (!data.session?.access_token) throw new Error("Authenticated session is unavailable");
  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers: { Authorization: `Bearer ${data.session.access_token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const body = await response.json() as { data?: T; error?: { message?: string | string[] } };
  if (!response.ok || body.data === undefined) throw new Error(Array.isArray(body.error?.message) ? body.error.message.join(", ") : body.error?.message ?? "Calendar request failed");
  return body.data;
}

export function CalendarManager() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [calendarName, setCalendarName] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventStart, setEventStart] = useState("");
  const calendars = useQuery({ queryKey: ["calendars"], queryFn: () => api<Calendar[]>("/calendars") });
  const activeCalendar = calendars.data?.[0];
  const events = useQuery({ enabled: Boolean(activeCalendar), queryKey: ["calendar-events", activeCalendar?.id], queryFn: () => api<Event[]>(`/calendars/${activeCalendar?.id}/events`) });
  const createCalendar = useMutation({ mutationFn: (name: string) => api<Calendar>("/calendars", { method: "POST", body: JSON.stringify({ name }) }), onSuccess: async () => { setCalendarName(""); await client.invalidateQueries({ queryKey: ["calendars"] }); toast({ title: "Calendar created", tone: "success" }); } });
  const createEvent = useMutation({ mutationFn: () => api<Event>(`/calendars/${activeCalendar?.id}/events`, { method: "POST", body: JSON.stringify({ title: eventTitle, starts_at: new Date(eventStart).toISOString(), event_type: "GENERAL" }) }), onSuccess: async () => { setEventTitle(""); setEventStart(""); await client.invalidateQueries({ queryKey: ["calendar-events"] }); toast({ title: "Event created", tone: "success" }); } });

  function submitCalendar(event: FormEvent) { event.preventDefault(); createCalendar.mutate(calendarName); }
  function submitEvent(event: FormEvent) { event.preventDefault(); createEvent.mutate(); }

  return <section className="mt-6 grid gap-5 lg:grid-cols-2">
    <Card><CardHeader><CardTitle>Shared calendars</CardTitle><CardDescription>Calendars are scoped to this tenant and can be shared through event invitations.</CardDescription></CardHeader>
      <form className="flex gap-2" onSubmit={submitCalendar}><Input aria-label="Calendar name" value={calendarName} onChange={(event) => setCalendarName(event.target.value)} placeholder="Calendar name" required /><Button disabled={createCalendar.isPending}>Create calendar</Button></form>
      <div className="mt-4 space-y-2">{calendars.data?.map((calendar) => <div key={calendar.id} className="rounded-md border border-border p-3"><strong>{calendar.name}</strong>{calendar.description ? <p className="text-sm text-muted">{calendar.description}</p> : null}</div>)}</div>
    </Card>
    <Card><CardHeader><CardTitle>Events</CardTitle><CardDescription>{activeCalendar ? `Adding to ${activeCalendar.name}` : "Create a calendar to start planning."}</CardDescription></CardHeader>
      {activeCalendar ? <><form className="grid gap-2" onSubmit={submitEvent}><Input aria-label="Event title" value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="Event title" required /><Input aria-label="Event start" type="datetime-local" value={eventStart} onChange={(event) => setEventStart(event.target.value)} required /><Button disabled={createEvent.isPending}>Create event</Button></form><div className="mt-4 space-y-2">{events.data?.map((event) => <div key={event.id} className="rounded-md border border-border p-3"><div className="flex justify-between gap-2"><strong>{event.title}</strong><Badge tone="info">{event.event_type}</Badge></div><p className="mt-1 text-sm text-muted">{new Date(event.starts_at).toLocaleString()}</p>{event.recurrence_rule ? <p className="text-xs text-muted">Recurring: {event.recurrence_rule}</p> : null}</div>)}</div></> : <EmptyState description="No shared calendar is available yet." title="Create your first calendar" />}
    </Card>
  </section>;
}
