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
  let y = 682;
  pdf.setTitle("Beyond Hello - Your practice report");
  pdf.setAuthor("Beyond Hello");
  page.drawRectangle({ x: 0, y: 712, width: 612, height: 80, color: navy });
  page.drawRectangle({ x: 0, y: 708, width: 612, height: 4, color: gold });
  page.drawText("BEYOND HELLO", { x: margin, y: 761, size: 10, font: bold, color: gold });
  page.drawText("Your practice report", { x: margin, y: 733, size: 24, font: bold, color: rgb(1, 1, 1) });
  const drawWrapped = (text: string, size = 12, color = ink) => {
    for (const line of wrapText(safePdfText(text, preserveUnicode), bodyFont, size, width)) {
      page.drawText(line, { x: margin, y, size, font: bodyFont, color });
      y -= size + 6;
    }
  };
  const section = (title: string) => {
    y -= 22;
    page.drawText(title, { x: margin, y, size: 14, font: bold, color: navy });
    y -= 10;
    page.drawRectangle({ x: margin, y, width, height: 1, color: gold });
    y -= 23;
  };
  const feedback = createSimpleFeedback(evaluateAdaptiveConversation(input.snapshot.turns, input.snapshot.localeTag));
  const responses = input.snapshot.turns.filter(turn => turn.role === "learner").length;
  const date = new Date(input.snapshot.turns[0]?.occurredAt ?? Date.now()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  section("Your session");
  drawWrapped(`${input.languageName} | ${date} | ${responses} ${responses === 1 ? "response" : "responses"}`, 11, muted);
  section("What went well");
  for (const strength of feedback.strengths) { drawWrapped(`- ${strength}`); y -= 5; }
  section("One thing to improve");
  drawWrapped(feedback.improvement);
  section("Try this next time");
  drawWrapped(feedback.nextStep);
  if (y < 90) throw new Error("Practice report exceeded its single-page layout.");
  page.drawRectangle({ x: margin, y: 65, width, height: 1, color: rgb(0.86, 0.89, 0.91) });
  for (const [index, line] of wrapText(simpleReportDisclaimer, regular, 9, width).entries()) {
    page.drawText(line, { x: margin, y: 48 - index * 13, size: 9, font: regular, color: muted });
  }
  return pdf.save();
}
