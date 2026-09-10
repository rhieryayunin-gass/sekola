// Read-only external monitor. Exit nonzero on any failed gate; no secrets required.
const expected = process.env.EXPECTED_RELEASE_SHA;
if (!/^[a-f0-9]{40}$/.test(expected ?? "")) throw new Error("Set EXPECTED_RELEASE_SHA to the deployed source commit");
function origin(name) {
  const value = new URL(process.env[name]);
  if (value.protocol !== "https:" || value.username || value.password || value.pathname !== "/" || value.search || value.hash) throw new Error(`${name} must be an HTTPS origin`);
  return value.origin;
}
const api = origin("API_ORIGIN");
const web = origin("WEB_ORIGIN");
const checks = [
  ["api_liveness", `${api}/api/v1/health`, 200, body => body.success === true && body.data?.service === "sekola-api" && body.data?.release === expected],
  ["api_readiness", `${api}/api/v1/ready`, 200, body => body.success === true && body.data?.status === "ready"],
  ["web_liveness", `${web}/healthz`, 200, body => body.service === "sekola-web" && body.release === expected],
  ["anonymous_access_denied", `${api}/api/v1/auth/me`, 401, body => body.success === false],
];
for (const [name, url, status, validate] of checks) {
  const start = performance.now();
  let ok = false;
  let statusCode;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error", headers: { "Cache-Control": "no-cache" } });
    statusCode = response.status;
    ok = statusCode === status && validate(await response.json());
  } catch { /* Do not log URLs, response bodies or dependency details. */ }
  console.log(JSON.stringify({ event: "deployment_probe", name, ok, statusCode, durationMs: Math.round(performance.now() - start), release: expected }));
  if (!ok) process.exitCode = 1;
}
