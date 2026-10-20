import { PDFDocument, type PDFFont, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { evaluateAdaptiveConversation } from "@/lib/conversation/adaptive-rubric";
import type { PracticeSnapshot } from "@/lib/practice/store";
import type { SavedRecording } from "@/lib/practice/recording-store";
import { createSimpleFeedback, simpleReportDisclaimer } from "./simple-feedback";

interface PracticeReportInput {
  snapshot: PracticeSnapshot;
  languageName: string;
  recordings: readonly SavedRecording[];
  unicodeFontBytes?: Uint8Array;
}

const navy = rgb(0, 49 / 255, 92 / 255);
const gold = rgb(1, 198 / 255, 39 / 255);
const ink = rgb(20 / 255, 43 / 255, 68 / 255);
const muted = rgb(91 / 255, 111 / 255, 132 / 255);

function safePdfText(value: string, preserveUnicode: boolean): string {
  const text = value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...");
  return preserveUnicode ? text.normalize("NFC") : text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\n]/g, "?");
}

function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
    if (line) lines.push(line);
    line = "";
    for (const character of Array.from(word)) {
      if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = ""; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function createPracticeReport(input: PracticeReportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  if (input.unicodeFontBytes) pdf.registerFontkit(fontkit);
  const bodyFont = input.unicodeFontBytes ? await pdf.embedFont(input.unicodeFontBytes, { subset: true }) : regular;
  const preserveUnicode = Boolean(input.unicodeFontBytes);
  const page = pdf.addPage([612, 792]);
  const margin = 48;
  const width = 516;
  let y = 659;
  pdf.setTitle("Beyond Hello - Language Practice Report");
  pdf.setAuthor("Beyond Hello");
  page.drawText("BEYOND HELLO", { x: margin, y: 750, size: 10, font: bold, color: navy });
  page.drawText("Language Practice Report", { x: margin, y: 717, size: 23, font: bold, color: navy });
  page.drawText("Session summary and development plan", { x: margin, y: 696, size: 11, font: regular, color: muted });
  page.drawRectangle({ x: margin, y: 679, width, height: 2, color: gold });
  const drawWrapped = (text: string, size = 11, color = ink, indent = 0) => {
    for (const line of wrapText(safePdfText(text, preserveUnicode), bodyFont, size, width - indent)) {
      page.drawText(line, { x: margin + indent, y, size, font: bodyFont, color });
      y -= size + 6;
    }
  };
  let sectionNumber = 0;
  const section = (title: string) => {
    y -= 23;
    page.drawText(String(++sectionNumber).padStart(2, "0"), { x: margin, y, size: 10, font: bold, color: muted });
    page.drawText(title, { x: margin + 29, y, size: 13, font: bold, color: navy });
    y -= 11;
    page.drawRectangle({ x: margin, y, width, height: 0.6, color: rgb(0.84, 0.88, 0.91) });
    y -= 25;
  };
  const feedback = createSimpleFeedback(evaluateAdaptiveConversation(input.snapshot.turns, input.snapshot.localeTag));
  const responses = input.snapshot.turns.filter(turn => turn.role === "learner").length;
  const date = new Date(input.snapshot.turns[0]?.occurredAt ?? Date.now()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  section("Session Overview");
  const fields = [["PRACTICE LANGUAGE", input.languageName], ["SESSION DATE", date], ["RESPONSES", String(responses)]];
  page.drawRectangle({ x: margin, y: y - 40, width, height: 62, color: rgb(0.96, 0.97, 0.98) });
  for (const [index, [label, value]] of fields.entries()) {
    const x = margin + 14 + index * 172;
    page.drawText(label, { x, y: y + 5, size: 8, font: bold, color: muted });
    const lines = wrapText(safePdfText(value, preserveUnicode), bodyFont, 10, 145);
    for (const [lineIndex, line] of lines.entries()) page.drawText(line, { x, y: y - 15 - lineIndex * 13, size: 10, font: bodyFont, color: ink });
  }
  y -= 62;
  section("Observed Strengths");
  for (const strength of feedback.strengths) {
    page.drawCircle({ x: margin + 3, y: y + 3, size: 2, color: navy });
    drawWrapped(strength, 11, ink, 14); y -= 7;
  }
  section("Development Priority");
  drawWrapped(feedback.improvement);
  section("Recommended Practice");
  const actionLines = wrapText(safePdfText(feedback.nextStep, preserveUnicode), bodyFont, 11, width - 30);
  const actionHeight = actionLines.length * 17 + 24;
  page.drawRectangle({ x: margin, y: y - actionHeight + 15, width, height: actionHeight, color: rgb(0.96, 0.97, 0.98) });
  page.drawRectangle({ x: margin, y: y - actionHeight + 15, width: 3, height: actionHeight, color: gold });
  for (const line of actionLines) { page.drawText(line, { x: margin + 15, y, size: 11, font: bodyFont, color: ink }); y -= 17; }
  y -= 15;
  if (y < 90) throw new Error("Practice report exceeded its single-page layout.");
  page.drawRectangle({ x: margin, y: 65, width, height: 1, color: rgb(0.86, 0.89, 0.91) });
  for (const [index, line] of wrapText(simpleReportDisclaimer, regular, 8, width - 75).entries()) {
    page.drawText(line, { x: margin, y: 48 - index * 12, size: 8, font: regular, color: muted });
  }
  page.drawText("Page 1 of 1", { x: 520, y: 48, size: 8, font: regular, color: muted });
  return pdf.save();
}
