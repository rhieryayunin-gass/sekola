function requireEnvironment(name) {
  const value = process.env[name]?.trim();

  if (!value) throw new Error(`${name} is required`);
  return value;
}

const baseUrl = requireEnvironment("WEB_BASE_URL").replace(/\/$/, "");
const response = await fetch(`${baseUrl}/dashboard?source=staging`, {
  redirect: "manual",
});

if (![307, 308].includes(response.status)) {
  throw new Error(`Anonymous dashboard request returned ${response.status}`);
}

const location = response.headers.get("location");
if (!location) throw new Error("Protected-route redirect has no location header");

const redirectUrl = new URL(location, baseUrl);
if (redirectUrl.pathname !== "/login") {
  throw new Error(`Anonymous dashboard redirected to ${redirectUrl.pathname}`);
}

if (redirectUrl.searchParams.get("next") !== "/dashboard?source=staging") {
  throw new Error("Protected-route redirect did not preserve the safe next path");
}

console.log("✓ Anonymous dashboard request redirected to login");
console.log("✓ Safe internal next path was preserved");
