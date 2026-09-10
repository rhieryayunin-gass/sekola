import assert from "node:assert/strict";
async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
}
async function wait(url) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await request(url)).ok) return; } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Container did not become live");
}
await Promise.all([wait("http://127.0.0.1:3101/api/v1/health"), wait("http://127.0.0.1:3100/healthz")]);
const api = await request("http://127.0.0.1:3101/api/v1/health");
assert.equal(api.headers.get("cache-control"), "no-store");
assert.equal((await api.json()).data.release, process.env.EXPECTED_RELEASE_SHA);
const ready = await request("http://127.0.0.1:3101/api/v1/ready");
assert.equal(ready.status, 503, "Unavailable Supabase must fail readiness, not liveness");
for (const route of ["auth/me", "permissions", "notifications", "audit-logs", "academic-years", "teachers", "courses", "attendance", "finance/dashboard", "team/projects", "operations/rooms", "analytics/executive"]) {
  assert.equal((await request(`http://127.0.0.1:3101/api/v1/${route}`)).status, 401, `${route} must require authentication`);
}
const web = await request("http://127.0.0.1:3100/healthz");
assert.equal((await web.json()).release, process.env.EXPECTED_RELEASE_SHA);
const login = await request("http://127.0.0.1:3100/login");
assert.equal(login.status, 200);
const html = await login.text();
const asset = html.match(/src="([^" ]*\/_next\/static\/[^" ]+\.js)"/);
assert.ok(asset, "Standalone page must reference built assets");
assert.equal((await request(`http://127.0.0.1:3100${asset[1]}`)).status, 200);
const protectedPage = await request("http://127.0.0.1:3100/dashboard", { redirect: "manual" });
assert.equal(protectedPage.status, 307);
const location = protectedPage.headers.get("location");
assert.ok(location, "Protected page must provide a login redirect");
// HTTP Location may be relative; resolve it against the requested origin.
const redirect = new URL(location, "http://127.0.0.1:3100");
assert.equal(redirect.origin, "http://127.0.0.1:3100");
assert.equal(redirect.pathname, "/login");
assert.equal(redirect.searchParams.get("next"), "/dashboard");
console.log("Non-root read-only containers, dependency failure, auth denial, web assets and login redirect passed");
