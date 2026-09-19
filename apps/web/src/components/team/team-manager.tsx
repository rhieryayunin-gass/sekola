"use client";
import { PersonPicker } from "../part10/person-picker";
import { ProjectActions } from "../part10/project-actions";
import { useTranslations } from "../i18n/i18n-provider";
import { schoolRpc, useCatalog } from "../../lib/school";
import { ProjectCommittee } from "../school/project-committee";
import { ConnectLink } from "../connect/connect-link";
import { useUiText } from "../i18n/ui-text";
import { apiBaseUrl } from "../../lib/api/base-url";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { Pagination } from "../ui/pagination";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Input } from "../ui/input";
import { Modal } from "../ui/modal";
import { Select } from "../ui/select";
import { useToast } from "../ui/toast";

type Status = "BACKLOG" | "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
type View = "timeline" | "activity" | "settings" | "finance";
type User = { id: string; full_name?: string; email?: string };
type Project = { id: string; code: string; name: string; description?: string; status: string; owner_user_id: string; starts_on?: string; due_on?: string };
type Task = { id: string; task_number: number; title: string; description?: string; status: Status; priority: string; assignee_user_id?: string; assignee?: User; due_date?: string; starts_on?:string;parent_task_id?:string;parent_title?:string };
type Member = { id: string; user_id: string; member_role: string; user?: User };
type Comment = { id: string; body: string; created_at: string; author?: User };
type Activity = { id: string; activity_type: string; entity_type: string; created_at: string; actor?: User; metadata?: Record<string, unknown> };
type Settings = { visibility: "PROJECT" | "TENANT"; notifications_enabled: boolean; allow_member_comments: boolean };
type Invoice = { id: string; invoice_number: string; description?: string; amount: number; due_date: string; status: string };
type Payment = { id: string; project_invoice_id: string; receipt_number: string; amount: number; paid_at: string; status: string };
type Finance = { invoices: Invoice[]; payments: Payment[]; summary: { outstanding_invoices: number; invoiced_amount: number; paid_amount: number; outstanding_amount: number } };

const columns: { key: Status; label: string; tone: "neutral" | "info" | "warning" | "success" }[] = [
  { key: "BACKLOG", label: "Backlog", tone: "neutral" },
  { key: "TODO", label: "To do", tone: "info" },
  { key: "IN_PROGRESS", label: "In progress", tone: "warning" },
  { key: "REVIEW", label: "Review", tone: "info" },
  { key: "DONE", label: "Done", tone: "success" },
];

async function api<T>(path: string, init?: RequestInit) {
  const { data } = await createClient().auth.getSession();
  if (!data.session) throw new Error("Authenticated session is unavailable");
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json();
  if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message ?? "Request failed");
  return payload.data as T;
}

const person = (user?: User) => user?.full_name || user?.email || "Unassigned";
const money = (value: number | string = 0) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value));

export function TeamManager() {const copy=useUiText();const {locale}=useTranslations();const tr=(en:string,id:string)=>locale==="id-ID"?id:en;const [projectAction,setProjectAction]=useState<{project:Project;mode:"member"|"project"}>();const [editActivity,setEditActivity]=useState<Task>();
  const [projectPage, setProjectPage] = useState(1);
  const [taskPage, setTaskPage] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedProjectId, setProjectId] = useState("");
  const [view, setView] = useState<View>("timeline");
  const [projectModal, setProjectModal] = useState(false);
  const [taskModal, setTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task>();
  const [error, setError] = useState<string>();

  const projects = useQuery({ queryKey: ["team", "projects", projectPage], queryFn: () => api<Project[]>(`/team/projects?page=${projectPage}&page_size=50`) });
  const projectId = selectedProjectId || projects.data?.[0]?.id || "";
  const me = useQuery({ queryKey: ["users", "me"], queryFn: () => api<User>("/users/me") });
  const users = useCatalog("users");
  const tasks = useQuery({ queryKey: ["team", projectId, "tasks", taskPage], queryFn: async () => (await schoolRpc<{tasks:Task[]}>("school_project_work",{project_uuid:projectId,page_offset:(taskPage-1)*50})).tasks, enabled: Boolean(projectId) && view === "timeline" });
  const members = useQuery({ queryKey: ["team", projectId, "members"], queryFn: () => api<Member[]>(`/team/projects/${projectId}/members`), enabled: Boolean(projectId) });
  const settings = useQuery({ queryKey: ["team", projectId, "settings"], queryFn: () => api<Settings>(`/team/projects/${projectId}/settings`), enabled: Boolean(projectId) });
  const activity = useQuery({ queryKey: ["team", projectId, "activity"], queryFn: () => api<Activity[]>(`/team/projects/${projectId}/activity`), enabled: Boolean(projectId) && view === "activity" });
  const finance = useQuery({ queryKey: ["team", projectId, "finance"], queryFn: () => api<Finance>(`/team/projects/${projectId}/finance`), enabled: Boolean(projectId) && view === "finance" });
  const comments = useQuery({ queryKey: ["team", projectId, selectedTask?.id, "comments"], queryFn: () => api<Comment[]>(`/team/projects/${projectId}/tasks/${selectedTask?.id}/comments`), enabled: Boolean(projectId && selectedTask) });

  const refresh = (...keys: string[]) => Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: ["team", projectId, key] })));
  const createProject = useMutation({
    mutationFn: (body: object) => schoolRpc<Project>("school_project_template", { payload: body }),
    onSuccess: async (project) => { await queryClient.invalidateQueries({ queryKey: ["team", "projects"] }); await queryClient.invalidateQueries({queryKey:["school-calendar"]}); setProjectId(project.id); setProjectModal(false); toast({ title: "Team+ project created", tone: "success" }); },
  });
  const createTask = useMutation({
    mutationFn: (body: object) => schoolRpc<Task>("school_project_work",{project_uuid:projectId,action:"activity",payload:body,record_id:editActivity?.id??null}),
    onSuccess: async () => { await refresh("tasks", "activity"); setTaskModal(false); setEditActivity(undefined); await queryClient.invalidateQueries({queryKey:["school-calendar"]}); toast({ title: tr("Activity saved", "Kegiatan tersimpan"), tone: "success" }); },
  });
  const moveTask = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: Status }) => api<Task>(`/team/projects/${projectId}/tasks/${taskId}/move`, { method: "POST", body: JSON.stringify({ status }) }),
    onSuccess: async () => { await refresh("tasks", "activity"); await queryClient.invalidateQueries({queryKey:["school-calendar"]}); },
  });
  const addMember = useMutation({
    mutationFn: (body: object) => api<Member>(`/team/projects/${projectId}/members`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => refresh("members", "activity"),
  });
  const saveSettings = useMutation({
    mutationFn: (body: object) => api<Settings>(`/team/projects/${projectId}/settings`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: async () => { await refresh("settings", "activity"); toast({ title: "Project settings saved", tone: "success" }); },
  });
  const addComment = useMutation({
    mutationFn: (body: object) => api<Comment>(`/team/projects/${projectId}/tasks/${selectedTask?.id}/comments`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["team", projectId, selectedTask?.id, "comments"] }); await refresh("activity"); },
  });
  const createInvoice = useMutation({
    mutationFn: (body: object) => api<Invoice>(`/team/projects/${projectId}/finance/invoices`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => { await refresh("finance", "activity"); toast({ title: "Project invoice created", tone: "success" }); },
  });
  const createPayment = useMutation({
    mutationFn: (body: object) => api<Payment>(`/team/projects/${projectId}/finance/payments`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => { await refresh("finance", "activity"); toast({ title: "Project payment recorded", tone: "success" }); },
  });

  function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(undefined);
    const form = new FormData(event.currentTarget);
    createProject.mutate({ code: form.get("code"), name: form.get("name"), description: form.get("description") || undefined, template: form.get("template"), starts_on:form.get("starts_on")||null, due_on:form.get("due_on")||null, committee: Object.fromEntries(["CHAIR","SECRETARY","TREASURER"].map(role=>[role,form.get(role)])) }, { onError: (reason) => setError(reason instanceof Error ? reason.message : "Unable to create project") });
  }

  function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(undefined);
    const form = new FormData(event.currentTarget);
    createTask.mutate({ title: form.get("title"), description: form.get("description") || undefined, priority: form.get("priority"), assignee_user_id: form.get("assignee_user_id") || undefined, due_date: form.get("due_date") || null, starts_on:form.get("starts_on")||null,parent_task_id:form.get("parent_task_id")||null,status:form.get("status")||"TODO" }, { onError: (reason) => setError(reason instanceof Error ? reason.message : "Unable to create task") });
  }


  const activeProject = projects.data?.find((project) => project.id === projectId);
  const availableUsers = users.data?.map(u=>({id:u.id,full_name:String(u.name ?? u.full_name ?? "Pengguna")})) ?? (me.data ? [me.data] : []);

  return (
    <section className="p10-project-workspace mt-6 grid gap-5">
      <Card className="p10-project-list">
       <header className="school-section-title"><div><h2>{tr("Projects","Proyek")}</h2><p>{tr("Committees, activities and shared timelines.","Panitia, kegiatan, dan jadwal bersama.")}</p></div><Button onClick={()=>{setError(undefined);setProjectModal(true);}}>+ Project</Button></header>
       <div className="owner-table-scroll"><table className="owner-table"><thead><tr>{[tr("Project","Proyek"),"Status",tr("Timeline","Jadwal"),tr("Actions","Tindakan")].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{projects.data?.map(project=><tr key={project.id} data-selected={project.id===projectId}><td><button className="owner-name" onClick={()=>{setProjectId(project.id);setTaskPage(1);setSelectedTask(undefined);}}>{project.name}</button><small>{project.code}</small></td><td><Badge>{project.status.replaceAll("_"," ")}</Badge></td><td>{project.starts_on||"—"} → {project.due_on||"—"}</td><td><div className="p10-table-actions"><Button size="sm" variant="ghost" onClick={()=>setProjectAction({project,mode:"member"})}>{tr("Add Committee","Tambah Panitia")}</Button><Button size="sm" variant="ghost" onClick={()=>setProjectAction({project,mode:"project"})}>{tr("Edit Timeline","Edit Jadwal")}</Button></div></td></tr>)}</tbody></table></div>
       {!projects.isLoading&&!projects.data?.length&&<p className="school-empty">{tr("No projects yet.","Belum ada proyek.")}</p>}
       <Pagination page={projectPage} count={projects.data?.length??0} pending={projects.isFetching} onPage={page=>{setProjectPage(page);setProjectId("");setTaskPage(1);setSelectedTask(undefined);}}/>
      </Card>

      <div className="min-w-0">
        {[projects,tasks,members,settings,activity,finance,comments].some(query => query.isError) && <p role="alert" className="mb-3 text-danger">{copy("Some project data could not be loaded. Check permissions or retry.")}</p>}
        {moveTask.isError && <p role="alert" className="text-danger">{copy("Task move failed. Refresh and try again.")}</p>}
        {activeProject ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><p className="text-sm font-bold text-secondary">{activeProject.code}</p><h2 className="text-3xl font-black tracking-tight">{activeProject.name}</h2><p className="mt-1 text-sm text-muted">{activeProject.description || "Project planning and delivery workspace"}</p></div>
              <div className="flex flex-wrap gap-2"><ConnectLink kind="project" sourceId={activeProject.id}/><Button onClick={() => {setEditActivity(undefined);setError(undefined);setTaskModal(true);}}>{tr("+ Activity","+ Kegiatan")}</Button></div>
            </div>
            <nav className="mt-5 flex flex-wrap gap-2">
              {(["timeline", "activity", "settings", "finance"] as View[]).map((item) => <Button key={item} size="sm" variant={view === item ? "secondary" : "ghost"} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}</Button>)}
            </nav>

            {view === "timeline" && <div className="p10-project-timeline"><p>{tr("Scheduled projects, activities and subactivities appear in each committee member’s calendar.","Jadwal proyek, kegiatan, dan subkegiatan tampil di kalender setiap anggota panitia.")}</p><div className="owner-table-scroll"><table className="owner-table"><thead><tr>{[tr("Activity / Subactivity","Kegiatan / Subkegiatan"),tr("Responsible","Penanggung Jawab"),tr("Starts","Mulai"),tr("Ends","Selesai"),"Status",tr("Actions","Tindakan")].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{tasks.data?.map(task=><tr key={task.id}><td><button className="owner-name" onClick={()=>setSelectedTask(task)}>{task.title}</button>{task.parent_title&&<small>↳ {task.parent_title}</small>}</td><td>{person(task.assignee)}</td><td>{task.starts_on||"—"}</td><td>{task.due_date||"—"}</td><td><Badge>{task.status.replaceAll("_"," ")}</Badge></td><td><Button variant="ghost" size="sm" onClick={()=>{setEditActivity(task);setError(undefined);setTaskModal(true);}}>{tr("Edit","Edit")}</Button></td></tr>)}</tbody></table></div>{!tasks.data?.length&&<p className="school-empty">{tr("Add the first activity for this project.","Tambahkan kegiatan pertama untuk proyek ini.")}</p>}<Pagination page={taskPage} count={tasks.data?.length??0} pending={tasks.isFetching} onPage={setTaskPage}/></div>}

            {view === "activity" && <Card className="mt-5"><h3 className="text-lg font-bold">{copy("Project activity")}</h3><div className="mt-4 space-y-3">{activity.data?.map((item) => <div key={item.id} className="border-b border-border pb-3"><p className="font-semibold">{item.activity_type.replaceAll("_", " ")}</p><p className="text-sm text-muted">{person(item.actor)} · {new Date(item.created_at).toLocaleString("id-ID")}</p></div>)}{!activity.data?.length && <EmptyState title={copy("No activity yet")} description={copy("Task, comment, and finance changes will appear here.")} />}</div></Card>}

            {view === "settings" && <ProjectCommittee projectId={projectId}/>}
            {view === "settings" && <SettingsPanel settings={settings.data} members={members.data ?? []} users={availableUsers} onAddMember={(body) => addMember.mutate(body)} onSave={(body) => saveSettings.mutate(body)} />}

            {view === "finance" && <FinancePanel data={finance.data} onInvoice={(body) => createInvoice.mutate(body)} onPayment={(body) => createPayment.mutate(body)} />}
          </>
        ) : <Card><EmptyState title={copy("Create your first Team+ project")} description={tr("Use + Project to set up a committee and plan activities.","Gunakan + Project untuk menyusun panitia dan kegiatan.")} /></Card>}
      </div>

      <Modal isOpen={!!projectAction} onClose={()=>setProjectAction(undefined)} title={projectAction?.mode==="member"?tr("Add Committee Member","Tambah Anggota Panitia"):tr("Project Timeline","Jadwal Proyek")}>{projectAction&&<ProjectActions project={projectAction.project} users={availableUsers} mode={projectAction.mode} done={()=>setProjectAction(undefined)}/>}</Modal>
      <Modal isOpen={projectModal} onClose={() => setProjectModal(false)} title={tr("New Project","Proyek Baru")} description={tr("Choose the committee and set the project timeline.","Pilih panitia dan tentukan jadwal proyek.")}>
        <form className="space-y-3" onSubmit={submitProject}><Input name="code" label={copy("Project key")} placeholder="DIGITAL" required /><Input name="name" label={copy("Project name")} required /><Input name="description" label={copy("Description")} /><Select name="template" label="Template kegiatan" required><option value="GRADUATION">Kelulusan / wisuda</option><option value="OPEN_HOUSE">Open house</option><option value="SCHOOL_TRIP">Kunjungan belajar</option><option value="SPORTS_DAY">Pekan olahraga</option><option value="CUSTOM">Kegiatan lainnya</option></Select>{[["CHAIR",tr("Chair / PIC","Ketua / PIC")],["SECRETARY",tr("Secretary","Sekretaris")],["TREASURER",tr("Treasurer","Bendahara")]].map(([key,label])=><PersonPicker key={key} name={key} label={label} users={availableUsers} required/>)}<Input name="starts_on" type="date" label={tr("Starts","Mulai")}/><Input name="due_on" type="date" label={tr("Ends","Selesai")}/>{error && <p className="text-sm text-danger">{error}</p>}<Button type="submit" disabled={createProject.isPending}>{copy("Create project")}</Button></form>
      </Modal>

      <Modal isOpen={taskModal} onClose={() => setTaskModal(false)} title={editActivity?tr("Edit Activity","Edit Kegiatan"):tr("New Activity","Kegiatan Baru")} description={tr("Assign a person, dates and an optional parent activity.","Tentukan penanggung jawab, tanggal, dan kegiatan induk opsional.")}>
        <form key={editActivity?.id??"new"} className="space-y-3" onSubmit={submitTask}><Input name="title" label={copy("Summary")} defaultValue={editActivity?.title} required /><label className="grid gap-1.5 text-sm font-medium">{copy("Description")}<textarea name="description" defaultValue={editActivity?.description} className="min-h-24 rounded-xl border border-border bg-surface p-3" /></label><Select name="priority" label={copy("Priority")} defaultValue={editActivity?.priority??"MEDIUM"}>{["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"].map((priority) => <option key={priority}>{priority}</option>)}</Select><Select name="assignee_user_id" label={copy("Assignee")} defaultValue={editActivity?.assignee_user_id??""}><option value="">{copy("Unassigned")}</option>{(members.data ?? []).map((member) => <option key={member.id} value={member.user_id}>{person(member.user)}</option>)}</Select><Input name="starts_on" type="date" label={tr("Starts","Mulai")} defaultValue={editActivity?.starts_on??""}/><Input name="due_date" type="date" label={copy("Due date")} defaultValue={editActivity?.due_date??""}/><Select name="parent_task_id" label={tr("Parent Activity (Optional)","Kegiatan Induk (Opsional)")} defaultValue={editActivity?.parent_task_id??""}><option value="">{tr("Main activity","Kegiatan utama")}</option>{tasks.data?.filter(t=>!t.parent_task_id&&t.id!==editActivity?.id).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</Select><Select name="status" label="Status" defaultValue={editActivity?.status??"TODO"}>{columns.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</Select>{error && <p className="text-sm text-danger">{error}</p>}<Button type="submit" disabled={createTask.isPending}>{tr("Save Activity","Simpan Kegiatan")}</Button></form>
      </Modal>

      <Modal isOpen={Boolean(selectedTask)} onClose={() => setSelectedTask(undefined)} title={selectedTask ? `${activeProject?.code}-${selectedTask.task_number} · ${selectedTask.title}` : "Task details"} description={selectedTask?.description || copy("No description")}>
        {selectedTask && <div><div className="flex flex-wrap gap-2"><Priority value={selectedTask.priority} /><Badge tone="info">{selectedTask.status.replaceAll("_", " ")}</Badge><Badge>{person(selectedTask.assignee)}</Badge></div><Select label="Pindahkan status" value={selectedTask.status} disabled={moveTask.isPending} onChange={e=>{const status=e.target.value as Status;moveTask.mutate({taskId:selectedTask.id,status},{onSuccess:()=>setSelectedTask({...selectedTask,status})});}}>{columns.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</Select>{moveTask.isError&&<p role="alert">{moveTask.error.message}</p>}<h4 className="mt-6 font-bold">{copy("Comments")}</h4><div className="mt-3 max-h-52 space-y-3 overflow-y-auto">{comments.data?.map((comment) => <div key={comment.id} className="rounded-xl bg-surface p-3"><p className="text-sm">{comment.body}</p><p className="mt-1 text-xs text-muted">{person(comment.author)} · {new Date(comment.created_at).toLocaleString("id-ID")}</p></div>)}</div><form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const body = String(new FormData(form).get("body") ?? "").trim(); if (body) addComment.mutate({ body }, { onSuccess: () => form.reset() }); }}><Input name="body" placeholder={copy("Add a comment")} required /><Button type="submit" disabled={addComment.isPending}>{copy("Comment")}</Button></form></div>}
      </Modal>
    </section>
  );
}

function Priority({ value }: { value: string }) {
  const tone = value === "HIGHEST" ? "danger" : value === "HIGH" ? "warning" : value === "LOW" || value === "LOWEST" ? "neutral" : "info";
  return <Badge tone={tone}>{value}</Badge>;
}

function SettingsPanel({ settings, members, users, onAddMember, onSave }: { settings?: Settings; members: Member[]; users: User[]; onAddMember: (body: object) => void; onSave: (body: object) => void }) {const copy=useUiText();
  return <div className="mt-5 grid gap-5 lg:grid-cols-2"><Card><h3 className="text-lg font-bold">{copy("Project members")}</h3><div className="mt-4 space-y-2">{members.map((member) => <div key={member.id} className="flex justify-between rounded-xl bg-surface p-3"><span>{person(member.user)}</span><Badge>{member.member_role}</Badge></div>)}</div><form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onAddMember({ user_id: form.get("user_id"), member_role: form.get("member_role") }); }}><Select name="user_id" label={copy("Add user")} required><option value="">{copy("Select user")}</option>{users.map((user) => <option key={user.id} value={user.id}>{person(user)}</option>)}</Select><Select name="member_role" label={copy("Role")} defaultValue="MEMBER">{["MANAGER", "MEMBER", "VIEWER"].map((role) => <option key={role}>{role}</option>)}</Select><Button type="submit">{copy("Add member")}</Button></form></Card><Card><h3 className="text-lg font-bold">{copy("Project settings")}</h3>{settings && <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ visibility: form.get("visibility"), notifications_enabled: form.get("notifications_enabled") === "on", allow_member_comments: form.get("allow_member_comments") === "on" }); }}><Select name="visibility" label={copy("Visibility")} defaultValue={settings.visibility}><option value="PROJECT">{copy("Project members")}</option><option value="TENANT">{copy("Everyone in tenant")}</option></Select><label className="flex gap-2 text-sm"><input name="notifications_enabled" type="checkbox" defaultChecked={settings.notifications_enabled} /> {copy("Notifications enabled")}</label><label className="flex gap-2 text-sm"><input name="allow_member_comments" type="checkbox" defaultChecked={settings.allow_member_comments} /> {copy("Members may comment")}</label><Button type="submit">{copy("Save settings")}</Button></form>}</Card></div>;
}

function FinancePanel({ data, onInvoice, onPayment }: { data?: Finance; onInvoice: (body: object) => void; onPayment: (body: object) => void }) {const copy=useUiText();
  return <div className="mt-5 space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Invoiced", data?.summary.invoiced_amount], ["Paid", data?.summary.paid_amount], ["Outstanding", data?.summary.outstanding_amount], ["Open invoices", data?.summary.outstanding_invoices]].map(([label, value]) => <Card key={String(label)}><p className="text-sm text-muted">{label}</p><p className="mt-2 text-2xl font-black">{label === "Open invoices" ? Number(value ?? 0) : money(Number(value ?? 0))}</p></Card>)}</div><div className="grid gap-5 lg:grid-cols-2"><Card><h3 className="font-bold">{copy("Project invoices")}</h3><div className="mt-3 space-y-2">{data?.invoices.map((invoice) => <div key={invoice.id} className="rounded-xl bg-surface p-3"><div className="flex justify-between"><span className="font-semibold">{invoice.invoice_number}</span><Badge>{invoice.status}</Badge></div><p className="mt-1 text-sm text-muted">{money(invoice.amount)} {copy("· due")} {invoice.due_date}</p></div>)}</div><form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onInvoice({ invoice_number: form.get("invoice_number"), description: form.get("description") || undefined, amount: Number(form.get("amount")), due_date: form.get("due_date") }); }}><Input name="invoice_number" label={copy("Invoice number")} required /><Input name="description" label={copy("Description")} /><Input name="amount" type="number" min="0.01" step="0.01" label={copy("Amount")} required /><Input name="due_date" type="date" label={copy("Due date")} required /><Button type="submit">{copy("Create invoice")}</Button></form></Card><Card><h3 className="font-bold">{copy("Payments")}</h3><div className="mt-3 space-y-2">{data?.payments.map((payment) => <div key={payment.id} className="rounded-xl bg-surface p-3"><div className="flex justify-between"><span className="font-semibold">{payment.receipt_number}</span><Badge tone="success">{payment.status}</Badge></div><p className="mt-1 text-sm text-muted">{money(payment.amount)}</p></div>)}</div><form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onPayment({ project_invoice_id: form.get("project_invoice_id"), receipt_number: form.get("receipt_number"), amount: Number(form.get("amount")), status: "CONFIRMED" }); }}><Select name="project_invoice_id" label={copy("Invoice")} required><option value="">{copy("Select invoice")}</option>{data?.invoices.filter((invoice) => !["PAID", "VOID"].includes(invoice.status)).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} · {money(invoice.amount)}</option>)}</Select><Input name="receipt_number" label={copy("Receipt number")} required /><Input name="amount" type="number" min="0.01" step="0.01" label={copy("Amount")} required /><Button type="submit">{copy("Record payment")}</Button></form></Card></div></div>;
}
