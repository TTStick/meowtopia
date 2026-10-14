// Runtime configuration from environment variables (see .env.example).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';

const env = process.env;

export const PROD = env.NODE_ENV === 'production';
export const DATA_DIR = resolve(env.CAT_DATA_DIR || 'data');
mkdirSync(DATA_DIR, { recursive: true });

/** Extra browser origins allowed besides same-origin (e.g. the iOS app's capacitor://localhost). */
export const EXTRA_ORIGINS = (env.CAT_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Passkey relying party id. Defaults to the request's host name. */
export const RP_ID = env.CAT_RP_ID || '';

/**
 * Which peers may set X-Forwarded-For. 'private' (default) trusts loopback and
 * private network peers, which covers Caddy in the same Docker network.
 * 'none' ignores the header entirely.
 */
export const TRUST_PROXY = (env.CAT_TRUST_PROXY || 'private') as 'private' | 'none';

export const ADMIN_TOKEN = env.CAT_ADMIN_TOKEN || '';

export const LLM_USER_DAILY = Number(env.CAT_LLM_USER_DAILY || 120);

export const SESSION_DAYS = Number(env.CAT_SESSION_DAYS || 180);

// ---- secrets kept on disk in the data volume ----
interface Secrets {
  hmac: string; // recovery-code hashing and proof-of-work signatures
}
const SECRET_PATH = join(DATA_DIR, 'secret.json');
let secrets: Secrets;
if (existsSync(SECRET_PATH)) secrets = JSON.parse(readFileSync(SECRET_PATH, 'utf8'));
else {
  secrets = { hmac: randomBytes(32).toString('base64url') };
  writeFileSync(SECRET_PATH, JSON.stringify(secrets), { mode: 0o600 });
}
export const HMAC_KEY = Buffer.from(secrets.hmac, 'base64url');
