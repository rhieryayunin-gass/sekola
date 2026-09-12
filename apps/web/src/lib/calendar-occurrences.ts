import { RRule } from "rrule";
export type SchoolEvent = {id:string;calendar_id:string;title:string;description:string|null;starts_at:string;ends_at:string|null;is_all_day:boolean;event_type:string;recurrence_rule:string|null};
export type Occurrence = SchoolEvent & {instance:string;start:Date;end:Date;recurrence_error?:boolean};
export function occurrences(events:SchoolEvent[],start:Date,end:Date):Occurrence[]{
 const out:Occurrence[]=[];
 for(const event of events){const first=new Date(event.starts_at);const duration=Math.max(0,Date.parse(event.ends_at??event.starts_at)-first.getTime());let dates=[first];let invalid=false;
 if(event.recurrence_rule){try{const options=RRule.parseString(event.recurrence_rule);if(options.freq!==undefined&&options.freq>RRule.DAILY)throw new Error("Frequency too dense");const rule=new RRule({...options,dtstart:first});dates=rule.between(new Date(start.getTime()-duration),end,true,(_,i)=>i<2000);}catch{invalid=true;}}
 for(const date of dates){const finish=new Date(date.getTime()+duration);if(date<end&&finish>=start)out.push({...event,instance:`${event.id}:${date.toISOString()}`,start:date,end:finish,recurrence_error:invalid});}
 }
 return out.sort((a,b)=>a.start.getTime()-b.start.getTime());
}
export const dateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
export const localInput=(s:string)=>{const d=new Date(s);return `${dateKey(d)}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;};
