import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env"), quiet: true });

export function projectRoot(): string {
  return root;
}

export function cursorApiKey(): string | undefined {
  const key = process.env.CURSOR_API_KEY?.trim();
  return key || undefined;
}

export function cursorModel(): string {
  return process.env.CURSOR_MODEL?.trim() || "composer-2.5";
}

export function serverPort(): number {
  const raw = process.env.PORT?.trim();
  return raw ? Number(raw) : 8790;
}

/** Optional. Absolute path to the personal site repo. Used only by gitignored local/personal-site.ts. */
export function personalSiteRoot(): string | undefined {
  const raw = process.env.PERSONAL_SITE_ROOT?.trim();
  return raw || undefined;
}
