"use client";
import { useId, useState } from "react";
import { Input } from "../ui";
export type PersonOption={id:string;full_name?:string;name?:string;email?:string};
export function PersonPicker({name,label,users,required=false,defaultValue=""}:{name:string;label:string;users:PersonOption[];required?:boolean;defaultValue?:string}){
 const list=useId();
 const labels=users.map(user=>user.full_name||user.name||user.email||"User");const counts=new Map<string,number>();for(const label of labels)counts.set(label,(counts.get(label)||0)+1);
 const options=users.map((user,index)=>({id:user.id,label:user.full_name||user.name||user.email||`User ${index+1}`})).map((user,index)=>({...user,label:(counts.get(user.label)||0)>1?`${user.label} (${index+1})`:user.label}));
 const [text,setText]=useState(()=>options.find(u=>u.id===defaultValue)?.label||"");
 const selected=options.find(u=>u.label===text);
 return <div><Input label={label} name={`${name}_search`} list={list} autoComplete="off" placeholder="Search name / Cari nama" value={text} required={required} onChange={e=>{setText(e.target.value);e.target.setCustomValidity(e.target.value&&!options.some(u=>u.label===e.target.value)?"Choose a name from the list / Pilih nama dari daftar":"");}}/><input type="hidden" name={name} value={selected?.id||""}/><datalist id={list}>{options.filter(u=>!text||u.label.toLocaleLowerCase().includes(text.toLocaleLowerCase())).slice(0,100).map(u=><option key={u.id} value={u.label}/>)}</datalist></div>;
}
