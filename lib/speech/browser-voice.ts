interface BrowserVoice {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}

const femaleVoice = /\b(Samantha|Zira|Aria|Jenny|Susan|Hazel|Victoria|Karen|Moira|Fiona|Tessa|Serena|Ava|Allison|Joana|Luciana|Helena|Sabina|Hortense|Hedda|Elsa|Maria|Irina|Heera|Kalpana|Lekha|Ayumi|Haruka|Kyoko|Huihui|Ting-Ting|Mei-Jia|Yuna|Sora|Laura|Monica|Paulina|Amelie|Amélie|Audrey|Julie|Female)\b/i;
const normalize = (locale: string) => locale.toLowerCase().replaceAll("_", "-");

export async function loadBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window.speechSynthesis === "undefined") return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) return voices;
  await new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); window.speechSynthesis.removeEventListener("voiceschanged", finish); resolve(); };
    const timer = window.setTimeout(finish, 1000);
    window.speechSynthesis.addEventListener("voiceschanged", finish);
  });
  return window.speechSynthesis.getVoices();
}

export function selectMayaVoice<T extends BrowserVoice>(voices: readonly T[], localeTag: string): T | null {
  const locale = normalize(localeTag);
  const language = locale.split("-")[0];
  // A voice in another language must never outrank the requested language.
  const matching = voices.filter(voice => normalize(voice.lang).split("-")[0] === language);
  const score = (voice: T) => (normalize(voice.lang) === locale ? 100 : 0)
    + (femaleVoice.test(voice.name) ? 10 : 0) + (voice.localService ? 2 : 0) + (voice.default ? 1 : 0);
  return [...matching].sort((left, right) => score(right) - score(left))[0] ?? null;
}
