import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { evaluateAdaptiveConversation, rubricDimensionDefinitions } from "@/lib/conversation/adaptive-rubric";
import { inferPromptKind } from "@/lib/conversation/response-assessment";
import type { ConversationTurn } from "@/lib/conversation/types";
import type { PracticeSnapshot } from "@/lib/practice/store";
import type { SavedRecording } from "@/lib/practice/recording-store";

interface PracticeReportInput {
  snapshot: PracticeSnapshot;
  languageName: string;
  recordings: readonly SavedRecording[];
}

const navy = rgb(0, 49 / 255, 92 / 255);
const gold = rgb(1, 198 / 255, 39 / 255);
const ink = rgb(20 / 255, 43 / 255, 68 / 255);
const muted = rgb(91 / 255, 111 / 255, 132 / 255);
const pale = rgb(245 / 255, 247 / 255, 250 / 255);
const white = rgb(1, 1, 1);

function safePdfText(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "?");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = safePdfText(text).split(/\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

function durationLabel(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
}

function topicLabels(turns: readonly ConversationTurn[]): string[] {
  const labels: Record<string, string> = {
    introduction: "Personal introduction",
    work_studies: "Work or studies",
    background: "Background and influences",
    family: "Family",
    hobby: "Hobbies",
    free_time: "Free time",
    hometown: "Place description",
    event: "Past event narration",
    technology: "Opinion and examples",
    daily_routine: "Daily routine",
    community: "Hypothetical situation",
    study_abroad: "Advantages and disadvantages",
    role_play: "Role-play",
    weekend: "Future plans",
    next_topic: "Next practice topic",
  };
  return [...new Set(turns.filter((turn) => turn.role === "coach").map((turn) => labels[inferPromptKind(turn.text)]).filter(Boolean))];
}

function nextPracticeFocus(turns: readonly ConversationTurn[]): string {
  const learner = turns.filter((turn) => turn.role === "learner" && !turn.text.startsWith("[Spoken response recorded"));
  if (learner.length < 2) return "Complete a slightly longer conversation so you can practice responding across more than one topic.";
  const averageWords = learner.reduce((total, turn) => total + turn.text.split(/\s+/).filter(Boolean).length, 0) / learner.length;
  if (averageWords < 10) return "Add one supporting detail and one example to each answer while keeping your response natural.";
  if (!turns.some((turn) => turn.role === "coach" && inferPromptKind(turn.text) === "event")) return "In your next session, include a past event and organize it with a clear beginning, middle and ending.";
  if (!turns.some((turn) => turn.role === "coach" && ["technology", "study_abroad", "community"].includes(inferPromptKind(turn.text)))) return "In your next session, practice giving an opinion, explaining why and supporting it with an example.";
  return "Replay one response, notice where you paused, then record a second version with a clearer opening, supporting detail and closing thought.";
}

export async function createPracticeReport(input: PracticeReportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle("AI OPI Conversation Studio - Practice Report");
  pdf.setAuthor("AI OPI Conversation Studio");
  pdf.setSubject("Practice and reflection report");

  let page: PDFPage = pdf.addPage([612, 792]);
  pdf.removePage(0);
  let y = 0;
  const margin = 48;
  const pageWidth = 612;
  const contentWidth = pageWidth - margin * 2;

  const addPage = () => {
    page = pdf.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 720, width: 612, height: 72, color: navy });
    page.drawRectangle({ x: 0, y: 716, width: 612, height: 4, color: gold });
    page.drawText("AI OPI CONVERSATION STUDIO", { x: margin, y: 759, size: 10, font: bold, color: gold });
    page.drawText("Practice and Reflection Report", { x: margin, y: 736, size: 20, font: bold, color: white });
    y = 688;
  };

  const ensureSpace = (height: number) => { if (y - height < 58) addPage(); };
  const drawLines = (lines: string[], options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const size = options.size ?? 10;
    const selectedFont = options.font ?? regular;
    const lineGap = options.gap ?? size + 4;
    for (const line of lines) {
      ensureSpace(lineGap);
      page.drawText(line, { x: margin + (options.indent ?? 0), y, size, font: selectedFont, color: options.color ?? ink });
      y -= lineGap;
    }
  };
  const drawWrapped = (text: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; width?: number; gap?: number } = {}) => {
    const size = options.size ?? 10;
    const selectedFont = options.font ?? regular;
    const indent = options.indent ?? 0;
    drawLines(wrapText(text, selectedFont, size, options.width ?? contentWidth - indent), { ...options, size, font: selectedFont, indent });
  };
  const section = (title: string) => {
    ensureSpace(38);
    y -= 8;
    page.drawText(safePdfText(title.toUpperCase()), { x: margin, y, size: 10, font: bold, color: navy });
    y -= 8;
    page.drawRectangle({ x: margin, y, width: contentWidth, height: 1, color: gold });
    y -= 18;
  };

  addPage();
  const turns = input.snapshot.turns;
  const learnerTurns = turns.filter((turn) => turn.role === "learner");
  const startedAt = new Date(turns[0]?.occurredAt ?? Date.now());
  const endedAt = new Date(turns.at(-1)?.occurredAt ?? startedAt);
  const sessionDuration = Math.max(0, endedAt.getTime() - startedAt.getTime());
  const recordedDuration = input.recordings.reduce((total, recording) => total + recording.durationMs, 0);
  const rubricProfile = evaluateAdaptiveConversation(turns, input.snapshot.localeTag);

  page.drawText(safePdfText(input.snapshot.title), { x: margin, y, size: 24, font: bold, color: navy });
  y -= 26;
  drawWrapped(`${input.languageName} practice - ${startedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { size: 11, color: muted });

  section("Session overview");
  page.drawRectangle({ x: margin, y: y - 66, width: contentWidth, height: 76, color: pale });
  const overviewY = y - 14;
  const metrics = [
    [String(turns.length), "Conversation turns"],
    [String(learnerTurns.length), "Your responses"],
    [String(input.recordings.length), "Saved recordings"],
    [durationLabel(recordedDuration || sessionDuration), recordedDuration ? "Recorded speaking" : "Session length"],
  ];
  metrics.forEach(([value, label], index) => {
    const x = margin + 18 + index * 126;
    page.drawText(value, { x, y: overviewY, size: 18, font: bold, color: navy });
    page.drawText(label, { x, y: overviewY - 18, size: 8.5, font: regular, color: muted });
  });
  y -= 86;

  section("Adaptive coaching profile");
  drawWrapped(`${rubricProfile.currentStage} stage - ${rubricProfile.overallScore.toFixed(1)} / 5 coaching profile`, { size: 15, font: bold, color: navy });
  drawWrapped(rubricProfile.disclaimer, { size: 8.5, color: muted });
  y -= 6;
  for (const definition of rubricDimensionDefinitions) {
    const dimension = rubricProfile.dimensions[definition.key];
    ensureSpace(34);
    page.drawText(`${definition.label}: ${dimension.score.toFixed(1)} / 5`, { x: margin, y, size: 10, font: bold, color: navy });
    y -= 14;
    drawWrapped(dimension.evidence, { size: 9, color: muted, indent: 10, width: contentWidth - 10 });
    y -= 4;
  }

  if (!rubricProfile.languageUse.targetLocaleTag.toLowerCase().startsWith("en")) {
    section("Target-language consistency");
    drawWrapped(rubricProfile.languageUse.status === "mixed_language" ? "English appeared in the transcribed practice." : "The target language was maintained in the available transcript.", { size: 12, font: bold, color: navy });
    drawWrapped(rubricProfile.languageUse.summary, { size: 10 });
    if (rubricProfile.languageUse.englishWords.length) drawWrapped(`English words to replace next time: ${rubricProfile.languageUse.englishWords.join(", ")}`, { size: 10, font: bold, color: navy });
    drawWrapped("This is a transcript-based coaching check. Speech recognition can occasionally mishear a word.", { size: 8.5, color: muted });
  }

  section("What you practiced");
  const topics = topicLabels(turns);
  drawWrapped(topics.length ? topics.join(" - ") : "Personal conversation and spontaneous speaking", { size: 11 });
  y -= 4;
  drawWrapped("This is a practice record, not a score, official evaluation, proficiency label or readiness decision.", { size: 9, color: muted });

  section("Conversation transcript");
  for (const turn of turns) {
    const elapsed = Math.max(0, Math.round((new Date(turn.occurredAt).getTime() - startedAt.getTime()) / 1000));
    const time = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
    const speaker = turn.role === "coach" ? "MAYA" : "YOU";
    const text = turn.text.startsWith("[Spoken response recorded") ? "Spoken response recorded. Automatic transcript unavailable." : turn.text;
    const lines = wrapText(text, regular, 10, contentWidth - 58);
    ensureSpace(28 + lines.length * 14);
    page.drawText(`${time}  ${speaker}`, { x: margin, y, size: 9, font: bold, color: turn.role === "coach" ? navy : rgb(128 / 255, 91 / 255, 0) });
    y -= 16;
    drawLines(lines, { size: 10, indent: 16, color: ink });
    y -= 8;
  }

  section("Suggested next practice");
  drawWrapped(rubricProfile.recommendation || nextPracticeFocus(turns), { size: 11 });
  y -= 8;
  drawWrapped(`Stronger phrase to try: "${rubricProfile.strongerPhrase}"`, { size: 10, font: bold, color: navy });
  y -= 6;
  drawWrapped(`Strengths: ${rubricProfile.strengths.join(" ")}`, { size: 9, color: muted });
  y -= 4;
  drawWrapped(`Growth areas: ${rubricProfile.growthAreas.join(" ")}`, { size: 9, color: muted });
  y -= 8;
  drawWrapped("Replay your recording and choose one response to repeat. Focus on communicating your meaning naturally rather than memorizing a perfect answer.", { size: 10, color: muted });

  section("Reflection checklist");
  drawWrapped("1. Listen to your response once without reading the transcript.", { size: 10 });
  y -= 4;
  drawWrapped("2. Read the transcript and identify one place where another detail or example would make your meaning clearer.", { size: 10 });
  y -= 4;
  drawWrapped("3. Record the answer again in your own words and compare how naturally the ideas connect.", { size: 10 });

  const pages = pdf.getPages();
  pages.forEach((reportPage, index) => {
    reportPage.drawRectangle({ x: margin, y: 38, width: contentWidth, height: 1, color: rgb(220 / 255, 226 / 255, 232 / 255) });
    reportPage.drawText("Practice only - no scores or official evaluation", { x: margin, y: 21, size: 8, font: regular, color: muted });
    reportPage.drawText(`Page ${index + 1} of ${pages.length}`, { x: 510, y: 21, size: 8, font: regular, color: muted });
  });

  return pdf.save();
}
