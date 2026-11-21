// The languages students can code in, with their Judge0 ids and time limits.
// Ids checked against https://ce.judge0.com/languages on 2026-11-21.

export const LANGUAGES = {
  cpp: { id: 105, label: 'C++ (GCC 14)', factor: 1, startupSec: 0 },
  python: { id: 109, label: 'Python 3.13', factor: 3, startupSec: 1.5 },
  javascript: { id: 102, label: 'JavaScript (Node 22)', factor: 2, startupSec: 1.5 },
  java: { id: 91, label: 'Java (JDK 17)', factor: 2, startupSec: 0.5 },
};

export const LANGUAGE_KEYS = Object.keys(LANGUAGES);

// Slower languages get more time, like on most contest sites. Python and Node also get
// extra "startup" time because Judge0 CE's images for them spend ~1.1 s starting (measured).
// Judge0 CE refuses limits above 15 s.
export function timeLimitFor(language, baseSec = 2) {
  const lang = LANGUAGES[language];
  return Math.min(15, Math.round((baseSec * lang.factor + lang.startupSec) * 10) / 10);
}
