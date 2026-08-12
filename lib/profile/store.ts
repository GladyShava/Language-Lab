import { eq, sql } from "drizzle-orm";
import { studentProfiles } from "@/db/schema";

export type ProfileStorageMode = "d1" | "memory";

export interface StudentProfile {
  id: string;
  asuEmail: string;
  preferredFirstName: string;
  surname: string;
  classCohort: string;
  nativeLanguage: string;
  targetLanguagePackId: string;
}

interface StoredStudentProfile extends StudentProfile {
  passwordHash: string;
  passwordSalt: string;
}

const memoryProfiles = new Map<string, StoredStudentProfile>();
const passwordIterations = 150_000;

// Prototype-only credentials so the presentation build always has a usable
// account even when a local D1 database has not been configured.
const demoCredentials = {
  email: "demo.student@asu.edu",
  password: "Practice2026!",
} as const;

const demoProfile: StudentProfile = {
  id: "demo-student-profile",
  asuEmail: demoCredentials.email,
  preferredFirstName: "Alex",
  surname: "Morgan",
  classCohort: "Spring 26",
  nativeLanguage: "English",
  targetLanguagePackId: "en-US",
};

async function loadDb() {
  const { getDb } = await import("@/db");
  return getDb();
}

function encodeBytes(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function decodeBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function derivePasswordHash(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = Uint8Array.from(salt).buffer;
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations: passwordIterations }, key, 256);
  return encodeBytes(new Uint8Array(bits));
}

async function createPasswordRecord(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { passwordHash: await derivePasswordHash(password, salt), passwordSalt: encodeBytes(salt) };
}

async function passwordMatches(password: string, passwordHash: string, passwordSalt: string) {
  if (!passwordHash || !passwordSalt) return false;
  const candidate = await derivePasswordHash(password, decodeBytes(passwordSalt));
  if (candidate.length !== passwordHash.length) return false;
  let difference = 0;
  for (let index = 0; index < candidate.length; index += 1) difference |= candidate.charCodeAt(index) ^ passwordHash.charCodeAt(index);
  return difference === 0;
}

function publicProfile(profile: StoredStudentProfile): StudentProfile {
  return {
    id: profile.id,
    asuEmail: profile.asuEmail,
    preferredFirstName: profile.preferredFirstName,
    surname: profile.surname,
    classCohort: profile.classCohort,
    nativeLanguage: profile.nativeLanguage,
    targetLanguagePackId: profile.targetLanguagePackId,
  };
}

export async function studentProfileExists(asuEmail: string): Promise<boolean> {
  const normalizedEmail = asuEmail.toLocaleLowerCase();
  if (normalizedEmail === demoCredentials.email) return true;
  if ([...memoryProfiles.values()].some((profile) => profile.asuEmail === normalizedEmail)) return true;
  try {
    const db = await loadDb();
    const [record] = await db.select({ id: studentProfiles.id }).from(studentProfiles)
      .where(sql`lower(${studentProfiles.asuEmail}) = ${normalizedEmail}`).limit(1);
    return Boolean(record);
  } catch {
    return false;
  }
}

export async function createStudentProfile(
  input: Omit<StudentProfile, "id"> & { password: string },
): Promise<{ profile: StudentProfile; storageMode: ProfileStorageMode }> {
  const { password, ...profileInput } = input;
  const credentials = await createPasswordRecord(password);
  const storedProfile: StoredStudentProfile = { id: crypto.randomUUID(), ...profileInput, ...credentials };
  try {
    const db = await loadDb();
    const now = new Date();
    await db.insert(studentProfiles).values({ ...storedProfile, createdAt: now, updatedAt: now });
    return { profile: publicProfile(storedProfile), storageMode: "d1" };
  } catch {
    memoryProfiles.set(storedProfile.id, storedProfile);
    return { profile: publicProfile(storedProfile), storageMode: "memory" };
  }
}

export async function getStudentProfile(id: string, storageMode: ProfileStorageMode): Promise<StudentProfile | null> {
  if (id === demoProfile.id) return demoProfile;
  if (storageMode === "memory") {
    const profile = memoryProfiles.get(id);
    return profile ? publicProfile(profile) : null;
  }
  try {
    const db = await loadDb();
    const [profile] = await db.select({
      id: studentProfiles.id,
      asuEmail: studentProfiles.asuEmail,
      preferredFirstName: studentProfiles.preferredFirstName,
      surname: studentProfiles.surname,
      classCohort: studentProfiles.classCohort,
      nativeLanguage: studentProfiles.nativeLanguage,
      targetLanguagePackId: studentProfiles.targetLanguagePackId,
    }).from(studentProfiles).where(eq(studentProfiles.id, id)).limit(1);
    if (!profile || !profile.surname || !profile.classCohort || !profile.nativeLanguage || !profile.targetLanguagePackId) return null;
    return profile;
  } catch {
    return null;
  }
}

export async function signInStudentProfile(
  asuEmail: string,
  password: string,
): Promise<{ profile: StudentProfile; storageMode: ProfileStorageMode } | null> {
  const normalizedEmail = asuEmail.toLocaleLowerCase();
  if (normalizedEmail === demoCredentials.email && password === demoCredentials.password) {
    return { profile: demoProfile, storageMode: "memory" };
  }
  const memoryProfile = [...memoryProfiles.values()].find((profile) => profile.asuEmail === normalizedEmail);
  if (memoryProfile && await passwordMatches(password, memoryProfile.passwordHash, memoryProfile.passwordSalt)) {
    return { profile: publicProfile(memoryProfile), storageMode: "memory" };
  }

  try {
    const db = await loadDb();
    const [record] = await db.select({
      id: studentProfiles.id,
      asuEmail: studentProfiles.asuEmail,
      passwordHash: studentProfiles.passwordHash,
      passwordSalt: studentProfiles.passwordSalt,
      preferredFirstName: studentProfiles.preferredFirstName,
      surname: studentProfiles.surname,
      classCohort: studentProfiles.classCohort,
      nativeLanguage: studentProfiles.nativeLanguage,
      targetLanguagePackId: studentProfiles.targetLanguagePackId,
    }).from(studentProfiles).where(sql`lower(${studentProfiles.asuEmail}) = ${normalizedEmail}`).limit(1);
    if (!record || !await passwordMatches(password, record.passwordHash, record.passwordSalt)) return null;
    return { profile: publicProfile(record), storageMode: "d1" };
  } catch {
    return null;
  }
}
