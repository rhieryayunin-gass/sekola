// Prevent a privileged key or development endpoint from entering browser bundles.
for (const name of ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
  const url = new URL(process.env[name]);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error(`${name} must be an HTTPS origin`);
}
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
let anon = false;
try { anon = JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role === "anon"; } catch { /* Not a legacy JWT. */ }
if (!key.startsWith("sb_publishable_") && !anon) throw new Error("Use only a Supabase publishable or legacy anon key for the web build");
if (!/^[a-f0-9]{40}$/.test(process.env.RELEASE_SHA ?? "")) throw new Error("RELEASE_SHA must be a full commit SHA");
