import { createClient } from "../../../../lib/supabase/server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request) {
  const message = new URL(request.url).searchParams.get("message");
  if (!message || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(message)) return Response.json({ error: "Invalid message" }, { status: 400, headers });
  const client = await createClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return Response.json({ error: "Authentication required" }, { status: 401, headers });
  // RLS rechecks current conversation membership before every download.
  const { data, error } = await client.from("oconnect_messages").select("attachment_path,attachment_name,attachment_type,deleted_at").eq("id", message).single();
  if (error || !data?.attachment_path || data.deleted_at) return Response.json({ error: "Attachment unavailable" }, { status: 404, headers });
  const { data: file, error: downloadError } = await client.storage.from("oconnect-attachments").download(data.attachment_path);
  if (downloadError || !file) return Response.json({ error: "Attachment unavailable" }, { status: 404, headers });
  const name = String(data.attachment_name ?? "attachment").replace(/[\r\n"\\]/g, "_");
  const inline = new URL(request.url).searchParams.get("view") === "1" && ["image/png", "image/jpeg", "image/webp"].includes(data.attachment_type);
  return new Response(file, { headers: { ...headers, "Content-Type": inline ? data.attachment_type : "application/octet-stream", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`, "Content-Security-Policy": "sandbox; default-src 'none'" } });
}
