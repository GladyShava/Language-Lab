import { PDFDocument, type PDFFont, StandardFonts, rgb } from "pdf-lib";
import { evaluateAdaptiveConversation } from "@/lib/conversation/adaptive-rubric";
import type { PracticeSnapshot } from "@/lib/practice/store";
import type { SavedRecording } from "@/lib/practice/recording-store";
import { createSimpleFeedback, simpleReportDisclaimer } from "./simple-feedback";

interface PracticeReportInput {
  snapshot: PracticeSnapshot;
  languageName: string;
  recordings: readonly SavedRecording[];
}

const navy = rgb(0, 49 / 255, 92 / 255);
const gold = rgb(1, 198 / 255, 39 / 255);
const ink = rgb(20 / 255, 43 / 255, 68 / 255);
const muted = rgb(91 / 255, 111 / 255, 132 / 255);

function safePdfText(value: string): string {
  const text = value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...");
  return text.normalize("NFC");
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
  // Report text is generated in English; transcript characters must not change
  // its font. Standard PDF fonts also retain the Latin accents used in labels.
  const bodyFont = regular;
  const page = pdf.addPage([419.53, 595.28]); // A5 keeps a short report proportionate when printed.
  const margin = 36;
  const width = 347.53;
  let y = 467;
  pdf.setTitle("Beyond Hello - Language Practice Report");
  pdf.setAuthor("Beyond Hello");
  page.drawText("BEYOND HELLO", { x: margin, y: 553, size: 9, font: bold, color: navy });
  page.drawText("Language Practice Report", { x: margin, y: 521, size: 21, font: bold, color: navy });
  page.drawRectangle({ x: margin, y: 500, width, height: 2, color: gold });
  const drawWrapped = (text: string, size = 11, color = ink, indent = 0) => {
    for (const line of wrapText(safePdfText(text), bodyFont, size, width - indent)) {
      page.drawText(line, { x: margin + indent, y, size, font: bodyFont, color });
      y -= size + 6;
    }
  };
  const section = (title: string) => {
    y -= 25;
    page.drawText(title, { x: margin, y, size: 12, font: bold, color: navy });
    y -= 11;
    page.drawRectangle({ x: margin, y, width, height: 0.6, color: rgb(0.84, 0.88, 0.91) });
    y -= 25;
  };
  const feedback = createSimpleFeedback(evaluateAdaptiveConversation(input.snapshot.turns, input.snapshot.localeTag));
  const responses = input.snapshot.turns.filter(turn => turn.role === "learner").length;
  const date = new Date(input.snapshot.turns[0]?.occurredAt ?? Date.now()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const fields = [["LANGUAGE", input.languageName], ["DATE", date], ["RESPONSES", String(responses)]];
  const fieldOffsets = [12, 115, 270];
  const fieldWidths = [90, 145, 60];
  page.drawRectangle({ x: margin, y: y - 35, width, height: 55, color: rgb(0.96, 0.97, 0.98) });
  for (const [index, [label, value]] of fields.entries()) {
    const x = margin + fieldOffsets[index];
    page.drawText(label, { x, y: y + 2, size: 7, font: bold, color: muted });
    const lines = wrapText(safePdfText(value), bodyFont, 10, fieldWidths[index]);
    for (const [lineIndex, line] of lines.entries()) page.drawText(line, { x, y: y - 16 - lineIndex * 13, size: 10, font: bodyFont, color: ink });
  }
  y -= 54;
  section("Observed strengths");
  for (const strength of feedback.strengths) {
    page.drawCircle({ x: margin + 3, y: y + 3, size: 2, color: navy });
    drawWrapped(strength, 11, ink, 14); y -= 7;
  }
  section("Next practice task");
  const actionLines = wrapText(safePdfText(feedback.nextStep), bodyFont, 11, width - 30);
  const actionHeight = actionLines.length * 18 + 24;
  page.drawRectangle({ x: margin, y: y - actionHeight + 15, width, height: actionHeight, color: rgb(1, 0.977, 0.91) });
  page.drawRectangle({ x: margin, y: y - actionHeight + 15, width: 3, height: actionHeight, color: gold });
  for (const line of actionLines) { page.drawText(line, { x: margin + 15, y, size: 11, font: bodyFont, color: ink }); y -= 18; }
  y -= 15;
  if (y < 90) throw new Error("Practice report exceeded its single-page layout.");
  page.drawRectangle({ x: margin, y: 78, width, height: 1, color: rgb(0.86, 0.89, 0.91) });
  for (const [index, line] of wrapText(simpleReportDisclaimer, regular, 8, width).entries()) {
    page.drawText(line, { x: margin, y: 62 - index * 12, size: 8, font: regular, color: muted });
  }
  return pdf.save();
}
