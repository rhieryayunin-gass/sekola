import { createClient } from "./supabase/client";

export type ConnectContext = { user_id: string; tenant_id: string; full_name: string; can_manage: boolean; font_size: number };
export type Conversation = { id: string; kind: "DIRECT" | "GROUP" | "CLASS" | "PROJECT"; title: string; updated_at: string; muted: boolean; archived: boolean; is_manager: boolean; unread_count: number; preview: string | null; classroom_id: string | null; project_id: string | null };
export type ConnectMember = { id: string; full_name: string; last_read_seq: number; is_manager: boolean };
export type ConnectMessage = { id: string; seq: number; conversation_id: string; sender_id: string; sender_name: string; body: string; created_at: string; deleted_at: string | null; reply_to: string | null; reply_body: string | null; attachment_path: string | null; attachment_name: string | null; attachment_type: string | null; attachment_size: number | null; resource_type: ResourceKind | null; resource_id: string | null };
export type Thread = { messages: ConnectMessage[]; members: ConnectMember[] };
export type Contact = { id: string; full_name: string; is_staff: boolean };
export type Source = { id: string; name: string };
export type Sources = { classes: Source[]; projects: Source[] };
export type ResourceKind = "calendar" | "course" | "task";
export const fontSizes = [14, 16, 18, 20] as const;
export const attachmentTypes = ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"];
export const maxAttachmentSize = 10 * 1024 * 1024;
export function validateAttachment(file: Pick<File, "type" | "size">) {
  if (!attachmentTypes.includes(file.type)) return "type";
  if (file.size <= 0 || file.size > maxAttachmentSize) return "size";
  return null;
}
export function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join("").toUpperCase() || "O"; }
export function readByOthers(message: ConnectMessage, members: ConnectMember[]) {
  return members.some(member => member.id !== message.sender_id && member.last_read_seq >= message.seq);
}
export async function connectRpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await createClient().rpc(`oconnect_${name}`, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export function connectError(error: unknown, id: boolean) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("RATE_LIMIT")) return id ? "Terlalu banyak permintaan. Tunggu satu menit lalu coba lagi." : "Too many requests. Wait a minute and retry.";
  if (message.includes("FORBIDDEN")) return id ? "Anda tidak memiliki akses, atau keanggotaan Anda telah berubah." : "You do not have access, or your membership has changed.";
  if (message.includes("INVALID_ATTACHMENT")) return id ? "Lampiran belum berhasil diunggah atau formatnya tidak didukung." : "The attachment was not uploaded or its format is unsupported.";
  return id ? "Belum berhasil. Periksa koneksi lalu coba lagi." : "Unable to complete this. Check your connection and retry.";
}
