import { createClient } from "../../../../lib/supabase/server";
import { imageTypes } from "../../../../lib/media";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bucket = url.searchParams.get("bucket");
  const path = url.searchParams.get("path");
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!bucket || !["tenant-media", "tenant-learning", "platform-media"].includes(bucket) || !path || path.length > 400 || path.split("/").some(p => !p || p === "." || p === "..")) return new Response(null, { status: 400, headers });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401, headers });
  // Download with the caller's JWT. Storage RLS authorizes every read.
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return new Response(null, { status: 404, headers });
  const inline = imageTypes.includes(data.type);
  return new Response(data, { headers: { ...headers, "Content-Type": data.type || "application/octet-stream", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${path.split("/").at(-1)?.replace(/[^a-zA-Z0-9._-]/g, "_")}"` } });
}
