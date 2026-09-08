import { Injectable, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";
@Injectable()
export class NotificationsService {
  constructor(private readonly supabase: SupabaseService) {}
  private get client(){ return this.supabase.getClient(); }
  // Shared module integration contract: other Core+ modules pass their own
  // tenant/user context; this service never derives it from browser input.
  async create(input:{tenantId:string;userId:string;type:"INFO"|"SUCCESS"|"WARNING"|"ACTION_REQUIRED"|"APPROVAL"|"REMINDER"|"SYSTEM";title:string;body?:string}) {
    const {data,error}=await this.client.from("notifications").insert({tenant_id:input.tenantId,user_id:input.userId,type:input.type,title:input.title,body:input.body??null}).select("id").single();
    if(error||!data) throw new NotFoundException("Unable to create notification"); return data;
  }
  async findAll(userId:string){
    const {data,error}=await this.client.from("notifications").select("id,type,title,body,resource_type,resource_id,metadata,read_at,created_at").eq("user_id",userId).order("created_at",{ascending:false});
    if(error) throw new NotFoundException("Notifications not found"); return data??[];
  }
  async unreadCount(userId:string){ const {count,error}=await this.client.from("notifications").select("*",{count:"exact",head:true}).eq("user_id",userId).is("read_at",null); if(error) throw new NotFoundException("Notifications not found"); return {count:count??0}; }
  async markRead(userId:string,id:string){ const {data,error}=await this.client.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("user_id",userId).select("id,read_at").single(); if(error||!data) throw new NotFoundException("Notification not found"); return data; }
  async markAllRead(userId:string){ const {error}=await this.client.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",userId).is("read_at",null); if(error) throw new NotFoundException("Notifications not found"); return {success:true}; }
}
