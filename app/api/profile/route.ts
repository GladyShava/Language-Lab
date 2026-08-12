import { NextResponse } from "next/server";
import { createStudentProfile, getStudentProfile, signInStudentProfile, studentProfileExists, type ProfileStorageMode } from "@/lib/profile/store";
import { getLanguagePackDefinition } from "@/lib/language-packs/registry";

const profileCookie = "opi_profile";
const asuEmailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@asu\.edu$/i;

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

function profileCookieHeader(id: string, mode: ProfileStorageMode, secure: boolean) {
  const attributes = `Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  return `${profileCookie}=${encodeURIComponent(`${mode}:${id}`)}; ${attributes}`;
}

export async function GET(request: Request) {
  const [storedMode, id = ""] = decodeURIComponent(cookieValue(request, profileCookie)).split(":", 2);
  const mode: ProfileStorageMode = storedMode === "memory" ? "memory" : "d1";
  if (!id) return NextResponse.json({ profile: null });
  return NextResponse.json({ profile: await getStudentProfile(id, mode) });
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const asuEmail = String(body.asuEmail ?? "").trim().toLocaleLowerCase().slice(0, 160);
  const password = String(body.password ?? "").slice(0, 128);
  const preferredFirstName = String(body.preferredFirstName ?? "").trim().replace(/[^\p{L}\p{M}' -]/gu, "").split(/\s+/)[0].slice(0, 40);
  const surname = String(body.surname ?? "").trim().replace(/[^\p{L}\p{M}' -]/gu, "").slice(0, 60);
  const classCohort = String(body.classCohort ?? "").trim().replace(/[^\p{L}\p{M}\d' -]/gu, "").slice(0, 40);
  if (body.action === "sign_in") {
    if (!asuEmailPattern.test(asuEmail) || !password) return NextResponse.json({ error: "Enter your ASU email and password." }, { status: 400 });
    const found = await signInStudentProfile(asuEmail, password);
    if (!found) return NextResponse.json({ error: "The ASU email or password is incorrect." }, { status: 401 });
    const response = NextResponse.json({ profile: found.profile });
    response.headers.set("set-cookie", profileCookieHeader(found.profile.id, found.storageMode, new URL(request.url).protocol === "https:"));
    return response;
  }
  const nativeLanguage = String(body.nativeLanguage ?? "").trim().replace(/[^\p{L}\p{M}' ()-]/gu, "").slice(0, 60);
  const targetLanguagePackId = String(body.targetLanguagePackId ?? "").trim();
  if (!asuEmailPattern.test(asuEmail)) return NextResponse.json({ error: "Enter a valid ASU email ending in @asu.edu." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Create a password with at least 8 characters." }, { status: 400 });
  if (!preferredFirstName) return NextResponse.json({ error: "Enter your preferred first name." }, { status: 400 });
  if (!surname) return NextResponse.json({ error: "Enter your surname." }, { status: 400 });
  if (!classCohort) return NextResponse.json({ error: "Enter your class or cohort." }, { status: 400 });
  if (!nativeLanguage) return NextResponse.json({ error: "Enter your native language." }, { status: 400 });
  if (!getLanguagePackDefinition(targetLanguagePackId)) return NextResponse.json({ error: "Choose a valid OPI language." }, { status: 400 });
  if (await studentProfileExists(asuEmail)) return NextResponse.json({ error: "An account already exists for this ASU email. Choose Sign in." }, { status: 409 });
  const { profile, storageMode } = await createStudentProfile({ asuEmail, password, preferredFirstName, surname, classCohort, nativeLanguage, targetLanguagePackId });
  const response = NextResponse.json({ profile });
  response.headers.set("set-cookie", profileCookieHeader(profile.id, storageMode, new URL(request.url).protocol === "https:"));
  return response;
}

export async function DELETE(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const response = NextResponse.json({ signedOut: true });
  response.headers.set("set-cookie", `${profileCookie}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
  return response;
}
