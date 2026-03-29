// ─── Environment variable validation ─────────────────────────────────────────
// Validates required env vars at startup. Returns useful messages when missing.

interface EnvCheck {
  key: string;
  required: boolean;
  label: string;
}

const ENV_CHECKS: EnvCheck[] = [
  { key: 'MONGODB_URI', required: true, label: 'MongoDB connection string' },
  { key: 'OPENAI_API_KEY', required: true, label: 'OpenAI API key (embeddings)' },
  { key: 'ANTHROPIC_API_KEY', required: false, label: 'Anthropic API key (market suggestions)' },
  { key: 'FINNHUB_API_KEY', required: false, label: 'Finnhub API key (stock quotes)' },
];

export interface EnvStatus {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export function validateEnv(): EnvStatus {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const check of ENV_CHECKS) {
    const value = process.env[check.key];
    if (!value || value.trim() === '') {
      if (check.required) {
        missing.push(`${check.key} — ${check.label}`);
      } else {
        warnings.push(`${check.key} not set — ${check.label} (optional, some features disabled)`);
      }
    }
  }

  if (missing.length > 0) {
    console.error(`[env] Missing required environment variables:\n  ${missing.join('\n  ')}`);
  }
  if (warnings.length > 0) {
    console.warn(`[env] Optional environment variables not set:\n  ${warnings.join('\n  ')}`);
  }

  return { valid: missing.length === 0, missing, warnings };
}

/** Check a single env var, return its value or null with a warning */
export function requireEnv(key: string): string | null {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    console.warn(`[env] ${key} is not set`);
    return null;
  }
  return value;
}
