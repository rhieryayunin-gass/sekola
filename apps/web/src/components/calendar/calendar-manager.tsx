"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
} from "lucide-react";
import { browserApi } from "../../lib/api/browser";
import { schoolRpc } from "../../lib/school";
import { usePermissionStore } from "../../stores/permission-store";
import {
  occurrences,
  dateKey,
  localInput,
  type SchoolEvent,
  type Occurrence,
} from "../../lib/calendar-occurrences";
import { Button, Input, Select } from "../ui";
import { Modal } from "../ui/modal";
import { useTranslations } from "../i18n/i18n-provider";
import { timedLayout } from "../../lib/calendar-layout";
type Calendar = {
  id: string;
  name: string;
  can_edit: boolean;
  integration_managed: boolean;
};
type Context = { assets?:{id:string;name:string;category:string}[]; calendars: Calendar[]; events: SchoolEvent[] };
type View = "month" | "week" | "day" | "agenda";

export function CalendarManager() {
  const { locale } = useTranslations();
  const id = locale === "id-ID";
  const labels: Record<View, string> = id
    ? { month: "Bulan", week: "Minggu", day: "Hari", agenda: "Agenda" }
    : { month: "Month", week: "Week", day: "Day", agenda: "Agenda" };
  const qc = useQueryClient();
  const userId = usePermissionStore((s) => s.context?.userId);
  const has = usePermissionStore((s) => s.has);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(() => new Date());
  const [view, setView] = useState<View>("month");
  const [hidden, setHidden] = useState<string[]>([]);
  const [detail, setDetail] = useState<Occurrence>();
  const [editor, setEditor] = useState<SchoolEvent | "new" | "calendar">();
  const [error, setError] = useState("");
  const range = useMemo(() => {
    const start = new Date(
      date.getFullYear(),
      date.getMonth(),
      view === "month" || view === "agenda" ? 1 : date.getDate(),
    );
    if (view === "month" || view === "week")
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(
      end.getDate() +
        (view === "month" ? 42 : view === "week" ? 7 : view === "day" ? 1 : 31),
    );
    return { start, end };
  }, [date, view]);
  const q = useQuery({
    queryKey: [
      "school-calendar",
      userId,
      range.start.toISOString(),
      range.end.toISOString(),
    ],
    enabled: !!userId,
    queryFn: () =>
      schoolRpc<Context>("school_calendar_context", {
        starts: range.start.toISOString(),
        ends: range.end.toISOString(),
      }),
  });
  const events = useMemo(
    () =>
      occurrences(
        (q.data?.events ?? []).filter(
          (e) =>
            !hidden.includes(e.calendar_id) &&
            (!search ||
              (e.title + " " + (e.description ?? ""))
                .toLowerCase()
                .includes(search.toLowerCase())),
        ),
        range.start,
        range.end,
      ),
    [q.data, hidden, range, search],
  );
  const days = Array.from(
    { length: view === "month" ? 42 : view === "week" ? 7 : 1 },
    (_, i) => {
      const d = new Date(range.start);
      d.setDate(d.getDate() + i);
      return d;
    },
  );
  const dayEvents = (d: Date) => {
    const end = new Date(d);
    end.setDate(end.getDate() + 1);
    return events.filter((e) => e.start < end && e.end >= d);
  };
  const color = (id: string) =>
    `var(--calendar-${Math.max(0, q.data?.calendars.findIndex((c) => c.id === id) ?? 0) % 5})`;
  const save = useMutation({
    mutationFn: ({
      path,
      body,
      method = "POST",
    }: {
      path: string;
      body?: object;
      method?: string;
    }) =>
      path.includes("/events") && method !== "DELETE" ? schoolRpc("school_calendar_save", {calendar_uuid:path.split("/")[2],event_id:path.split("/")[4]||null,payload:body}) : browserApi(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    onSuccess: async () => {
      setEditor(undefined);
      setDetail(undefined);
      await qc.invalidateQueries({ queryKey: ["school-calendar"] });
    },
    onError: (e) => setError(e.message),
  });
  function shift(direction: number) {
    const d = new Date(date);
    if (view === "month" || view === "agenda") {
      d.setDate(1);
      d.setMonth(d.getMonth() + direction);
    } else d.setDate(d.getDate() + direction * (view === "week" ? 7 : 1));
    setDate(d);
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    if (editor === "calendar") {
      save.mutate({ path: "/calendars", body: { name: f.get("name") } });
      return;
    }
    const start = new Date(String(f.get("starts_at")));
    const end = new Date(String(f.get("ends_at")));
    if (end <= start) {
      setError(
        id
          ? "Waktu selesai harus setelah waktu mulai."
          : "The end must be after the start.",
      );
      return;
    }
    const repeat = String(f.get("repeat") ?? "");
    const existing = typeof editor === "object" ? editor : undefined;
    save.mutate({
      path: `/calendars/${existing?.calendar_id ?? f.get("calendar_id")}/events${existing ? `/${existing.id}` : ""}`,
      method: existing ? "PATCH" : "POST",
      body: {
        asset_id: f.get("asset_id")||null,
        title: f.get("title"),
        description: f.get("description"),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        is_all_day: f.get("is_all_day") === "on",
        event_type: f.get("event_type"),
        recurrence_rule:
          repeat === "KEEP"
            ? existing?.recurrence_rule
            : repeat
              ? `FREQ=${repeat};COUNT=${Number(f.get("count")) || 12}`
              : null,
      },
    });
  }
  function eventButton(event: Occurrence) {
    return (
      <button
        key={event.instance}
        className="school-calendar-event"
        style={{ borderLeftColor: color(event.calendar_id) }}
        onClick={() => {
          setDetail(event);
          setError("");
        }}
      >
        <span>
          {event.is_all_day
            ? ""
            : event.start.toLocaleTimeString(locale, {
                hour: "2-digit",
                minute: "2-digit",
              }) + " "}
        </span>
        {event.title}
      </button>
    );
  }
  return (
    <section className="school-calendar p10-calendar">
      <header className="school-calendar-toolbar">
        <CalendarDays size={25} />
        <h2>
          {date.toLocaleDateString(locale, { month: "long", year: "numeric" })}
        </h2>
        <Button
          variant="ghost"
          aria-label={id ? "Periode sebelumnya" : "Previous period"}
          onClick={() => shift(-1)}
        >
          <ChevronLeft size={18} />
        </Button>
        <Button variant="ghost" onClick={() => setDate(new Date())}>
          {id ? "Hari ini" : "Today"}
        </Button>
        <Button
          variant="ghost"
          aria-label={id ? "Periode berikutnya" : "Next period"}
          onClick={() => shift(1)}
        >
          <ChevronRight size={18} />
        </Button>
        <Select
          aria-label={id ? "Tampilan kalender" : "Calendar view"}
          value={view}
          onChange={(e) => setView(e.target.value as View)}
        >
          {Object.entries(labels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
        {has("calendar.create") && (
          <Button
            onClick={() => {
              setEditor("new");
              setError("");
            }}
            disabled={!q.data?.calendars.some((c) => c.can_edit)}
          >
            <Plus size={16} />
            {id ? "Acara" : "Event"}
          </Button>
        )}
      </header>
      <div className="school-calendar-layout">
        <div className="school-calendar-sidebar p10-calendar-tools">
          <Input
            type="search"
            label={id ? "Cari acara" : "Search events"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Input
            type="date"
            label={id ? "Tanggal" : "Date"}
            value={dateKey(date)}
            onChange={(e) => {
              if (e.target.value)
                setDate(new Date(e.target.value + "T12:00:00"));
            }}
          />
          <h3>{id ? "Kalender saya" : "My calendars"}</h3>
          {q.data?.calendars.map((c) => (
            <label className="p10-calendar-toggle" key={c.id}>
              <input
                type="checkbox"
                checked={!hidden.includes(c.id)}
                onChange={(e) =>
                  setHidden((old) =>
                    e.target.checked
                      ? old.filter((id) => id !== c.id)
                      : [...old, c.id],
                  )
                }
              />
              <span style={{ background: color(c.id) }} />
              {c.name}
            </label>
          ))}
          {has("calendar.create") && (
            <Button
              variant="ghost"
              onClick={() => {
                setEditor("calendar");
                setError("");
              }}
            >
              {id ? "+ Kalender baru" : "+ New calendar"}
            </Button>
          )}
          <small>
            {id
              ? "Waktu mengikuti zona perangkat Anda."
              : "Times use your device timezone."}
          </small>
        </div>
        <div className="school-calendar-main">
          {q.isError ? (
            <p role="alert" className="school-error">
              {q.error.message}
              <Button onClick={() => void q.refetch()}>
                {id ? "Coba lagi" : "Retry"}
              </Button>
            </p>
          ) : q.isLoading ? (
            <p role="status">{id ? "Memuat agenda…" : "Loading agenda…"}</p>
          ) : view === "month" ? (
            <>
              <div className="school-week-labels">
                {(id
                  ? ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]
                  : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
                ).map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="school-month-grid">
                {days.map((day) => (
                  <div
                    className="school-month-day"
                    key={dateKey(day)}
                    data-outside={day.getMonth() !== date.getMonth()}
                    data-today={dateKey(day) === dateKey(new Date())}
                  >
                    <button
                      className="school-day-number"
                      onClick={() => {
                        setDate(day);
                        setView("day");
                      }}
                    >
                      {day.getDate()}
                    </button>
                    {dayEvents(day).slice(0, 3).map(eventButton)}
                    {dayEvents(day).length > 3 && (
                      <button
                        onClick={() => {
                          setDate(day);
                          setView("day");
                        }}
                      >
                        +{dayEvents(day).length - 3} {id ? "lainnya" : "more"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : view === "agenda" ? (
            <div className="school-agenda">
              {events.length ? (
                events.map((event) => (
                  <article key={event.instance}>
                    <time>
                      {event.start.toLocaleDateString(locale, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </time>
                    {eventButton(event)}
                  </article>
                ))
              ) : (
                <p className="school-empty">
                  {id
                    ? "Tidak ada acara pada periode ini."
                    : "No events in this period."}
                </p>
              )}
            </div>
          ) : (
            <div className="school-time-scroll">
              <div
                className="school-time-grid"
                style={{
                  gridTemplateColumns: `52px repeat(${days.length},minmax(120px,1fr))`,
                }}
              >
                <div className="school-time-hours">
                  <span>{id ? "Waktu" : "Time"}</span>
                  {Array.from({ length: 24 }, (_, h) => (
                    <small key={h}>{String(h).padStart(2, "0")}:00</small>
                  ))}
                </div>
                {days.map((day) => (
                  <div key={dateKey(day)} className="school-time-day">
                    <header>
                      <strong>
                        {day.toLocaleDateString(locale, {
                          weekday: "short",
                          day: "numeric",
                        })}
                      </strong>
                      {dayEvents(day)
                        .filter((e) => e.is_all_day)
                        .map(eventButton)}
                    </header>
                    <div className="school-time-track">
                      {timedLayout(dayEvents(day), day).map(
                        ({ event: e, lane, lanes }) => {
                          const minutes = Math.max(
                            0,
                            (e.start.getTime() - day.getTime()) / 60000,
                          );
                          const endMinutes = Math.min(
                            1440,
                            (e.end.getTime() - day.getTime()) / 60000,
                          );
                          return (
                            <div
                              key={e.instance}
                              className="school-time-event"
                              style={{
                                top: (minutes / 60) * 52,
                                height: Math.max(
                                  30,
                                  ((endMinutes - minutes) / 60) * 52,
                                ),
                                left: `calc(${(lane / lanes) * 100}% + 2px)`,
                                width: `calc(${100 / lanes}% - 4px)`,
                              }}
                            >
                              {eventButton(e)}
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(undefined)}
        title={detail?.title ?? (id ? "Acara" : "Event")}
      >
        {detail && (
          <div className="p9-event-detail">
            <p>
              <Clock size={16} />
              {detail.start.toLocaleString(locale)} —{" "}
              {detail.end.toLocaleString(locale)}
            </p>
            <p>{detail.description}</p>{detail.asset_name&&<p><strong>{id?"Aset / Ruangan":"Asset / Room"}:</strong> {detail.asset_name}</p>}
            <p>
              {q.data?.calendars.find((c) => c.id === detail.calendar_id)?.name}
            </p>
            {detail.recurrence_rule && (
              <p>
                {id
                  ? "Acara berulang. Perubahan berlaku untuk seluruh rangkaian."
                  : "Recurring event. Changes apply to the entire series."}
              </p>
            )}
            {detail.recurrence_error && (
              <p role="alert">
                {id
                  ? "Pola perulangan belum dapat ditampilkan."
                  : "This recurrence pattern could not be displayed."}
              </p>
            )}
            {q.data?.calendars.find((c) => c.id === detail.calendar_id)
              ?.can_edit && (
              <div className="flex gap-3">
                {has("calendar.update") && (
                  <Button
                    onClick={() => {
                      const source = q.data.events.find(
                        (e) => e.id === detail.id,
                      );
                      setEditor(source);
                      setDetail(undefined);
                    }}
                  >
                    {id ? "Edit acara" : "Edit event"}
                  </Button>
                )}
                {has("calendar.delete") && (
                  <Button
                    variant="ghost"
                    disabled={save.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          id
                            ? "Hapus acara ini beserta seluruh perulangannya?"
                            : "Delete this event and all its occurrences?",
                        )
                      )
                        save.mutate({
                          path: `/calendars/${detail.calendar_id}/events/${detail.id}`,
                          method: "DELETE",
                        });
                    }}
                  >
                    {id ? "Hapus" : "Delete"}
                  </Button>
                )}
              </div>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
        )}
      </Modal>
      <Modal
        isOpen={!!editor}
        onClose={() => setEditor(undefined)}
        title={
          editor === "calendar"
            ? id
              ? "Kalender baru"
              : "New calendar"
            : typeof editor === "object"
              ? id
                ? "Edit acara"
                : "Edit event"
              : id
                ? "Acara baru"
                : "New event"
        }
      >
        <form
          key={typeof editor === "object" ? editor.id : editor}
          className="grid gap-4"
          onSubmit={submit}
        >
          {editor === "calendar" ? (
            <Input
              name="name"
              label={id ? "Nama kalender" : "Calendar name"}
              required
              maxLength={160}
            />
          ) : (
            <>
              <Input
                name="title"
                label={id ? "Judul acara" : "Event title"}
                defaultValue={typeof editor === "object" ? editor.title : ""}
                required
                maxLength={200}
              />
              <Select
                name="calendar_id"
                label={id ? "Kalender" : "Calendar"}
                disabled={typeof editor === "object"}
                defaultValue={
                  typeof editor === "object"
                    ? editor.calendar_id
                    : q.data?.calendars.find((c) => c.can_edit)?.id
                }
                required
              >
                {q.data?.calendars
                  .filter((c) => c.can_edit)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
              <Select name="asset_id" label={id?"Pesan Aset / Ruangan (Opsional)":"Book Asset / Room (Optional)"} defaultValue={typeof editor==="object"?editor.asset_id??"":""}><option value="">{id?"Tanpa pemesanan aset":"No asset booking"}</option>{q.data?.assets?.map(a=><option key={a.id} value={a.id}>{a.name} · {a.category}</option>)}</Select>
              <Input
                name="starts_at"
                label={id ? "Mulai" : "Starts"}
                type="datetime-local"
                defaultValue={
                  typeof editor === "object"
                    ? localInput(editor.starts_at)
                    : dateKey(date) + "T08:00"
                }
                required
              />
              <Input
                name="ends_at"
                label={id ? "Selesai" : "Ends"}
                type="datetime-local"
                defaultValue={
                  typeof editor === "object"
                    ? localInput(editor.ends_at ?? editor.starts_at)
                    : dateKey(date) + "T09:00"
                }
                required
              />
              <label>
                <input
                  type="checkbox"
                  name="is_all_day"
                  defaultChecked={
                    typeof editor === "object" && editor.is_all_day
                  }
                />{" "}
                {id ? "Sepanjang hari" : "All day"}
              </label>
              <Select
                name="event_type"
                label={id ? "Kategori" : "Category"}
                defaultValue={
                  typeof editor === "object" ? editor.event_type : "GENERAL"
                }
              >
                {["GENERAL", "MEETING", "HOLIDAY", "DEADLINE"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
              <Select
                name="repeat"
                label={id ? "Perulangan" : "Repeat"}
                defaultValue={
                  typeof editor === "object" && editor.recurrence_rule
                    ? "KEEP"
                    : ""
                }
              >
                <option value="">
                  {id ? "Tidak berulang" : "Does not repeat"}
                </option>
                {typeof editor === "object" && editor.recurrence_rule && (
                  <option value="KEEP">
                    {id ? "Pertahankan pola sekarang" : "Keep existing pattern"}
                  </option>
                )}
                <option value="DAILY">{id ? "Harian" : "Daily"}</option>
                <option value="WEEKLY">{id ? "Mingguan" : "Weekly"}</option>
                <option value="MONTHLY">{id ? "Bulanan" : "Monthly"}</option>
              </Select>
              <Input
                type="number"
                name="count"
                label={
                  id ? "Jumlah kejadian jika berulang" : "Number of occurrences"
                }
                min={1}
                max={366}
                defaultValue={12}
              />
              <Input
                name="description"
                label={id ? "Keterangan" : "Description"}
                defaultValue={
                  typeof editor === "object" ? (editor.description ?? "") : ""
                }
              />
            </>
          )}
          {error && (
            <p role="alert" className="school-error">
              {error}
            </p>
          )}
          <Button type="submit" disabled={save.isPending}>
            {id ? "Simpan" : "Save"}
          </Button>
        </form>
      </Modal>
    </section>
  );
}
