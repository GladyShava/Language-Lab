import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

interface AppBindings {
  DB?: D1Database;
  MEDIA?: R2Bucket;
}

export function getDb() {
  const bindings = env as unknown as AppBindings;
  if (!bindings.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(bindings.DB, { schema });
}

export function getMediaBucket() {
  const bindings = env as unknown as AppBindings;
  if (!bindings.MEDIA) {
    throw new Error("Cloudflare R2 binding `MEDIA` is unavailable.");
  }
  return bindings.MEDIA;
}
