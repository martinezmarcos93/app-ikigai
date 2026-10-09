export interface PasswordResetConfigInput {
  baseUrl?: string;
  apiKey?: string;
  from?: string;
  corsOrigins: readonly string[];
}

export interface ValidPasswordResetConfig {
  baseUrl: string;
  apiKey: string;
  from: string;
}

/** Validate deployment-only mail settings before the API starts listening. */
export function validatePasswordResetConfig(input: PasswordResetConfigInput): ValidPasswordResetConfig {
  const baseUrl = input.baseUrl?.trim();
  const apiKey = input.apiKey?.trim();
  const from = input.from?.trim();

  if (!baseUrl || !apiKey || !from) {
    throw new Error("PASSWORD_RESET_BASE_URL, RESEND_API_KEY, and PASSWORD_RESET_FROM are required in production.");
  }
  if (apiKey.length < 32) {
    throw new Error("RESEND_API_KEY must contain at least 32 characters.");
  }
  if (from.length > 254 || /[\r\n]/.test(from)) {
    throw new Error("PASSWORD_RESET_FROM must be a single-line sender of at most 254 characters.");
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("PASSWORD_RESET_BASE_URL must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("PASSWORD_RESET_BASE_URL must be HTTPS and contain no credentials.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("PASSWORD_RESET_BASE_URL must not contain a query string or fragment.");
  }
  if (!input.corsOrigins.includes(parsed.origin)) {
    throw new Error("PASSWORD_RESET_BASE_URL origin must be included in CORS_ORIGINS.");
  }

  return { baseUrl, apiKey, from };
}
