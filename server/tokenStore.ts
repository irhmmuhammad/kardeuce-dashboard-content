import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IntegrationMode, SocialPlatform } from '../shared/insights.ts';

/**
 * Server-side token storage: a JSON file at server/.data/tokens.json
 * (gitignored). Tokens never leave the server — routes only expose the
 * metadata in IntegrationStatus. Fine for a single-team local setup; move to
 * a database / secret manager before deploying anywhere shared.
 */

export interface StoredToken {
  platform: SocialPlatform;
  mode: IntegrationMode;
  accessToken: string;
  refreshToken?: string;
  /** ISO timestamp; undefined when the platform didn't tell us. */
  expiresAt?: string;
  refreshExpiresAt?: string;
  /** When the current access token was issued (Instagram refresh needs ≥24h). */
  issuedAt: string;
  accountId: string;
  accountName: string;
  connectedAt: string;
  /** Last token problem (shown in Settings), cleared on a successful call. */
  error?: string;
}

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '.data');
const FILE = join(DATA_DIR, 'tokens.json');

type TokenFile = Partial<Record<SocialPlatform, StoredToken>>;

function load(): TokenFile {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as TokenFile;
  } catch {
    console.warn('[tokens] tokens.json is unreadable; starting with no connections.');
    return {};
  }
}

let cache: TokenFile = load();

function save() {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE);
  try {
    chmodSync(FILE, 0o600);
  } catch {
    /* best effort (e.g. Windows) */
  }
}

export const tokenStore = {
  get(platform: SocialPlatform): StoredToken | undefined {
    return cache[platform];
  },
  set(token: StoredToken) {
    cache = { ...cache, [token.platform]: token };
    save();
  },
  update(platform: SocialPlatform, patch: Partial<StoredToken>) {
    const cur = cache[platform];
    if (!cur) return;
    cache = { ...cache, [platform]: { ...cur, ...patch } };
    save();
  },
  remove(platform: SocialPlatform) {
    const { [platform]: _removed, ...rest } = cache;
    void _removed;
    cache = rest;
    save();
  },
};
