export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url) {
    try {
      const response = await fetch(`${url}/storage/v1/object/public/platform-media/brand/osekola-logo`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (response.ok && ["image/png", "image/jpeg", "image/webp"].includes(response.headers.get("content-type")?.split(";")[0] ?? "")) return new Response(response.body, { headers: { "Content-Type": response.headers.get("content-type")!, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    } catch { /* The checked-in brand remains available during storage outages. */ }
  }
  return new Response(null, { status: 307, headers: { Location: "/brand/osekola.png", "Cache-Control": "no-store" } });
}
