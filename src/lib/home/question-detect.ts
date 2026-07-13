const QUESTION_STARTERS = [
  "how much",
  "how many",
  "do i have",
  "does",
  "what's",
  "what is",
  "what are",
  "when",
  "why",
  "is my",
  "am i",
  "which",
  "who",
  // Tagalog/Taglish equivalents — the AI itself understands Tagalog input,
  // so the question/entry router needs to recognize it too.
  "magkano",
  "ilan",
  "meron ba",
  "mayroon ba",
  "gaano",
  "saan",
  "alin",
  "sino",
  "bakit",
  "kailan",
  "paano",
];

export function isQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (t.endsWith("?")) return true;

  // Match whole words anywhere in the sentence (not just at the start) so
  // Tagalog questions, which don't always lead with the question word, are
  // still caught. Word-boundary matters here: a plain substring check would
  // wrongly match "who" inside "wholesale" — a word this app's own vocabulary
  // uses constantly for the wholesale price tier.
  const words = t.split(/[^a-z]+/).filter(Boolean);
  return QUESTION_STARTERS.some((starter) =>
    // Phrases and anything with punctuation (e.g. "what's") can't be tokenized
    // into a single word, so fall back to a plain substring check for those.
    starter.includes(" ") || starter.includes("'") ? t.includes(starter) : words.includes(starter),
  );
}
