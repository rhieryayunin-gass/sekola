import { isIP } from "node:net";

const DEFAULT_PORT = 3001;
const DEFAULT_WEB_ORIGIN = "http://localhost:3000";

type Environment = Record<string, unknown>;

function requireString(config: Environment, key: string): string {
  const value = config[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }

  return value.trim();
}

export function validateEnvironment(config: Environment): Environment {
  const portValue = config.PORT ?? DEFAULT_PORT;
  const port = Number(portValue);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  const host = String(config.HOST ?? "0.0.0.0");
  if (!isIP(host)) throw new Error("HOST must be an IP address");
  const mode = config.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(String(mode))) throw new Error("Invalid NODE_ENV");
  const supabaseUrl = requireString(config, "SUPABASE_URL");
  const production = mode === "production";
  const cors = production ? requireString(config, "CORS_ORIGINS") : String(config.CORS_ORIGINS ?? DEFAULT_WEB_ORIGIN);
  const validateUrl = (value: string, originOnly: boolean) => {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error("Invalid environment URL"); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || (originOnly && url.pathname !== "/")) throw new Error("Invalid environment URL");
    if (production && (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".localhost"))) throw new Error("Production URLs must use public HTTPS origins");
  };
  validateUrl(supabaseUrl, true);
  const origins = parseCorsOrigins(cors);
  if (!origins.length) throw new Error("CORS_ORIGINS cannot be empty");
  origins.forEach(origin => validateUrl(origin, true));
  const release = production ? requireString(config, "RELEASE_SHA") : String(config.RELEASE_SHA ?? "development");
  if (production && !/^[a-f0-9]{40}$/.test(release)) throw new Error("Production RELEASE_SHA must be a full commit SHA");

  return {
    ...config,
    NODE_ENV: mode,
    PORT: port,
    HOST: host,
    CORS_ORIGINS: origins.join(","),
    RELEASE_SHA: release,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: requireString(
      config,
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
  };
}

export function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? DEFAULT_WEB_ORIGIN)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
