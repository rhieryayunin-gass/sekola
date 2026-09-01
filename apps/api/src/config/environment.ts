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

  return {
    ...config,
    NODE_ENV: config.NODE_ENV ?? "development",
    PORT: port,
    CORS_ORIGINS: config.CORS_ORIGINS ?? DEFAULT_WEB_ORIGIN,
    SUPABASE_URL: requireString(config, "SUPABASE_URL"),
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
