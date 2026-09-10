/** Deployment configuration stores an origin; Nest serves routes under /api/v1. */
export function apiBaseUrl(configured = process.env.NEXT_PUBLIC_API_URL) {
  if (!configured) throw new Error("Public API configuration is missing");
  const base = configured.replace(/\/$/, "");
  return base.endsWith("/api/v1") ? base : base + "/api/v1";
}
