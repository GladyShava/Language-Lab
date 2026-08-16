import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

interface AppBindings {
  DB?: D1Database;
  MEDIA?: R2Bucket;
}

const runtime = globalThis as typeof globalThis & { __opiCloudflareBindings?: AppBindings };

export function setCloudflareBindings(bindings: AppBindings) {
  runtime.__opiCloudflareBindings = bindings;
}

export function getDb() {
  const bindings = runtime.__opiCloudflareBindings ?? {};
  if (!bindings.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(bindings.DB, { schema });
}

export function getMediaBucket() {
  const bindings = runtime.__opiCloudflareBindings ?? {};
  if (!bindings.MEDIA) {
    throw new Error("Cloudflare R2 binding `MEDIA` is unavailable.");
  }
  return bindings.MEDIA;
}
