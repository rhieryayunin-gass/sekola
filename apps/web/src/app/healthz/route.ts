export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", service: "sekola-web", release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.RELEASE_SHA ?? "development" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
