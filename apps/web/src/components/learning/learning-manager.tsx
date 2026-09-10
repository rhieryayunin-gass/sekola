"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { browserApi } from "../../lib/api/browser";
import { createClient } from "../../lib/supabase/client";
import { usePermissionStore } from "../../stores/permission-store";
import { useTranslations } from "../i18n/i18n-provider";
import { Button, Card, EmptyState, Input, Select, useToast } from "../ui";
import { Pagination } from "../ui/pagination";
type Resource = "courses" | "lessons" | "assignments" | "submissions";
type Row = { id: string; name?: string; title?: string; description?: string; material?: string; instructions?: string; content?: string; feedback?: string; score?: number; due_at?: string; course_id?: string; assignment_id?: string; student_id?: string; is_published?: boolean };
const tabs: Resource[] = ["courses","lessons","assignments","submissions"];
export function LearningManager() {
  const { t, locale } = useTranslations(); const { toast } = useToast();
  const context = usePermissionStore(s=>s.context); const has = usePermissionStore(s=>s.has);
  const [tab,setTab] = useState<Resource>("courses"); const [page,setPage] = useState(1);
  const [editing,setEditing] = useState<Row|null|undefined>(); const client = useQueryClient();
  const permitted = tabs.filter(key=>has(key+".read")); const resource=permitted.includes(tab)?tab:permitted[0]??"courses";
  const q=useQuery({queryKey:["learning",resource,page,context?.userId],queryFn:()=>browserApi<Row[]>("/"+resource+"?page="+page+"&page_size=50"),enabled:permitted.length>0});
  const courses=useQuery({queryKey:["learning","course-options",context?.userId],queryFn:()=>browserApi<Row[]>("/courses?page_size=100"),enabled:editing!==undefined&&resource!=="courses"&&has("courses.read")});
  const assignments=useQuery({queryKey:["learning","assignment-options",context?.userId],queryFn:()=>browserApi<Row[]>("/assignments?page_size=100"),enabled:editing!==undefined&&resource==="submissions"});
  const save=useMutation({mutationFn:({id,body}:{id?:string;body:Record<string,unknown>})=>browserApi<Row>("/"+resource+(id?"/"+id:""),{method:id?"PATCH":"POST",body:JSON.stringify(body)}),onSuccess:async()=>{await client.invalidateQueries({queryKey:["learning"]});setEditing(undefined);toast({title:t("saved"),tone:"success"});}});
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data=new FormData(event.currentTarget);const body:Record<string,unknown>={};
    for(const [key,value] of data.entries()) if(String(value).trim()) body[key]=String(value).trim();
    if(resource==="courses")body.is_active=true;
    if(resource==="lessons"||resource==="assignments")body.is_published=data.get("is_published")==="on";
    if(body.due_at)body.due_at=new Date(String(body.due_at)).toISOString();
    if(body.score)body.score=Number(body.score);
    if(resource==="submissions"&&!has("courses.create")){
      const {data:student,error}=await createClient().rpc("my_student_id");
      if(error||!student){toast({title:t("studentProfileRequired"),tone:"error"});return;}
      body.student_id=student;body.submitted_at=new Date().toISOString();
    }
    save.mutate({id:editing?.id,body});
  }
  const canWrite=has(resource+(editing?.id?".update":".create"));
  return <section><div className="flex flex-wrap justify-between gap-3"><nav className="flex flex-wrap gap-2">{permitted.map(key=><Button key={key} variant={resource===key?"secondary":"ghost"} onClick={()=>{setTab(key);setPage(1);setEditing(undefined);save.reset();}}>{t(key)}</Button>)}</nav>{has(resource+".create")&&<Button onClick={()=>{setEditing(null);save.reset();}}>{t(resource==="submissions"?"submitWork":"create")} +</Button>}</div>
    <div className={"mt-5 grid gap-5 "+(editing!==undefined?"lg:grid-cols-[1.5fr_1fr]":"")}><Card>
      {q.isLoading?<p role="status">{t("loading")}</p>:q.isError?<div role="alert"><p>{t("loadError")}</p><Button onClick={()=>void q.refetch()}>{t("retry")}</Button></div>:q.data?.length?<div className="grid gap-3">{q.data.map(row=><article key={row.id} className="rounded-xl border border-border p-5">
        <div className="flex items-start justify-between gap-3"><h2 className="font-medium">{row.name??row.title??assignments.data?.find(a=>a.id===row.assignment_id)?.title??t("submissions")}</h2>{has(resource+".update")&&<Button size="sm" variant="ghost" onClick={()=>{setEditing(row);save.reset();}}>{t("edit")}</Button>}</div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{row.description??row.material??row.instructions??row.content}</p>
        {row.due_at&&<p className="mt-3 text-sm">{t("dueAt")}: {new Date(row.due_at).toLocaleString(locale)}</p>}
        {row.is_published!==undefined&&<span className="mt-3 inline-block rounded-full bg-secondary-soft px-3 py-1 text-xs text-secondary">{t(row.is_published?"published":"draft")}</span>}
        {row.score!=null&&<p className="mt-3 font-medium">{t("score")}: {row.score}</p>}{row.feedback&&<p className="mt-2 text-sm">{row.feedback}</p>}
      </article>)}</div>:<EmptyState title={t("noRecords")} description={t("noRecordsDesc")}/>}
      <Pagination page={page} count={q.data?.length??0} pending={q.isFetching} onPage={setPage}/>
    </Card>{editing!==undefined&&canWrite&&<Card><h2 className="mb-4 font-medium">{t(editing?"edit":"create")} · {t(resource)}</h2><form key={resource+(editing?.id??"new")} onSubmit={e=>void submit(e)} className="grid gap-4">
      {resource==="courses"?<><Input name="name" label={t("title")} defaultValue={editing?.name} required/><Input name="description" label={t("description")} defaultValue={editing?.description}/>{["subject_id","teacher_id","classroom_id","academic_year_id","semester_id"].map(field=><Input key={field} name={field} label={t(field as "subject_id")} defaultValue={String((editing as Record<string,unknown>|null)?.[field]??"")} required pattern="[0-9a-fA-F-]{36}"/>)}</>:resource==="submissions"?<><Select name="assignment_id" label={t("assignment")} defaultValue={editing?.assignment_id} required disabled={assignments.isLoading}><option value="">{t("chooseAssignment")}</option>{assignments.data?.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}</Select>{has("courses.create")&&<Input name="student_id" label={t("student_id")} defaultValue={editing?.student_id} required/>}<label className="grid gap-2 text-sm">{t("content")}<textarea className="min-h-40 rounded-xl border border-border bg-surface p-3" name="content" defaultValue={editing?.content} required maxLength={20000}/></label>{has("courses.create")&&<><Input name="score" type="number" min={0} step="any" label={t("score")} defaultValue={editing?.score}/><Input name="feedback" label={t("feedback")} defaultValue={editing?.feedback}/></>}</>:<><Select name="course_id" label={t("course")} defaultValue={editing?.course_id} required disabled={courses.isLoading}><option value="">{t("chooseCourse")}</option>{courses.data?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select><Input name="title" label={t("title")} defaultValue={editing?.title} required/><label className="grid gap-2 text-sm">{t("content")}<textarea name={resource==="lessons"?"material":"instructions"} className="min-h-40 rounded-xl border border-border bg-surface p-3" defaultValue={editing?.material??editing?.instructions} maxLength={20000}/></label>{resource==="assignments"&&<Input name="due_at" label={t("dueAt")} type="datetime-local"/>}<label className="flex gap-2 text-sm"><input type="checkbox" name="is_published" defaultChecked={editing?.is_published??false}/>{t("published")}</label></>}
      {(courses.isError||assignments.isError)&&<p role="alert" className="text-danger">{t("loadError")}</p>}
      {save.isError&&<p role="alert" className="text-danger">{save.error.message}</p>}<div className="flex gap-2"><Button type="submit" disabled={save.isPending}>{t("save")}</Button><Button variant="ghost" onClick={()=>setEditing(undefined)}>{t("cancel")}</Button></div>
    </form></Card>}</div>
  </section>;
}
