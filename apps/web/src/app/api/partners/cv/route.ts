import { createClient } from "../../../../lib/supabase/server";
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id))
    return new Response(null, { status: 400 });
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const { data, error } = await client.rpc("school_partner_document", {
    application_id: id,
  });
  if (error || !data) return new Response(null, { status: 403 });
  return new Response(Buffer.from(data.data, "base64"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${String(data.name).replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
