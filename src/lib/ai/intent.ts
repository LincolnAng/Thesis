/**
 * What kind of message is this, decided locally and for free.
 *
 * The assistant costs money and a round trip, and the owner's commonest message by far is a
 * transaction log — "sold 10 jars to Nena". Those must keep going straight down the existing
 * path, untouched and unslowed. Only a question that is actually asking for advice should reach
 * the advisor, which is a bigger prompt and a longer answer.
 *
 * Deliberately conservative: when a message could be either, it is treated as a transaction.
 * Mistaking advice for a log costs one wasted card the owner can dismiss; mistaking a log for
 * advice loses the thing she was trying to record.
 */

export type Intent = "transaction" | "advice" | "chat";

export interface IntentGuess {
  intent: Intent;
  /**
   * True when the wording decides it on its own — a clear log, a bare greeting, an obvious
   * question about the outside world. False means the rules are guessing, and the caller
   * should ask a model instead of trusting this.
   */
  confident: boolean;
}

/** Verbs and nouns that mean "something happened", in English, Tagalog and Cebuano. */
const TRANSACTION_WORDS = [
  "sold", "sell", "bought", "buy", "paid", "spent", "made", "produced", "wasted", "spoiled",
  "threw", "gave", "delivered", "received", "restocked",
  "nabenta", "binenta", "benta", "bumili", "bili", "bayad", "binayad", "gastos", "ginawa",
  "niluto", "nasira", "tapon", "sayang", "nagbenta", "palit", "utang", "nahulog",
  "gipalit", "gibaligya", "nabaligya", "gibayad",
];

/** Openers that mean "I want you to think with me". */
const ADVICE_WORDS = [
  "should", "advice", "advise", "recommend", "suggest", "help me", "what if", "worth it",
  "better to", "ideas", "idea for", "strategy", "plan for", "how do i", "how can i",
  "how should", "is it good", "do you think", "opinion", "next step", "grow", "expand",
  "improve", "pwede ba", "dapat ba", "paano", "ano ang maganda", "mas maganda",
  "anong gagawin", "unsaon", "angay ba",
];

/**
 * Questions about the world outside her ledger. These MUST reach the advisor, because it is
 * the only path with web search — the chat assistant is deliberately confined to her own
 * figures and will answer "I can only see your own business numbers", which is a dead end
 * when the honest answer is one search away.
 */
const EXTERNAL_TOPICS = [
  "world market", "world price", "global", "market price", "going rate", "market rate",
  "competitor", "competitors", "others charge", "other brands", "industry",
  "cacao price", "cocoa price", "price of cacao", "price of cocoa", "bean price",
  "trend", "trending", "trends", "demand for", "popular", "in demand",
  "regulation", "regulations", "requirement", "requirements", "law", "legal",
  "permit", "permits", "license", "licence", "fda", "bir", "dti", "export", "import",
  "certification", "certificate", "halal", "haccp", "tariff", "duty", "customs",
  "presyo sa", "sa labas", "ibang tindahan",
];

/**
 * Phrases that are unambiguously asking for a judgement rather than a fact. No keyword list
 * is needed to know "should I raise my prices" wants advice — so don't pay for one.
 */
const DECISION_PHRASES = [
  "should i", "should we", "is it worth", "worth it", "better to", "do you think",
  "what should i", "which should i", "would you", "recommend", "advise me",
  "dapat ba", "mas maganda ba", "pwede ba akong", "angay ba",
];

/** Openers that are asking a question even without a question mark. */
const QUESTION_OPENERS = [
  "how much", "how many", "how do", "how can", "how should", "how long", "how often",
  "what is", "what's", "whats", "what are", "what should", "what can", "what do",
  "when is", "when should", "when do", "where can", "where do", "where should",
  "which", "why is", "why do", "is it", "are there", "can i", "should i", "do i need",
  "magkano", "ano ang", "ano ba", "paano", "kailan", "saan", "pwede ba", "dapat ba",
];

/** Subjects the advisor has playbooks for — a strong signal even without an advice verb. */
const ADVICE_TOPICS = [
  "cacao", "cocoa", "beans",
  "price", "pricing", "presyo", "margin", "profit", "breakeven", "break even",
  "permit", "license", "licence", "fda", "dti", "bir", "export", "certification", "compliance",
  "supplier", "sourcing", "shortage", "substitute", "ingredient", "beans",
  "season", "harvest", "stock up", "hoard", "dry season", "wet season",
  "marketing", "promo", "campaign", "customer", "target market", "brand",
  "expansion", "channel", "consignment", "wholesale", "corporate", "gift box",
  "recipe", "new product", "flavour", "flavor", "variant", "name", "naming", "packaging", "label",
  "trend", "forecast", "demand",
];

const GREETINGS = [
  "hi", "hello", "hey", "kumusta", "kamusta", "musta", "good morning", "good afternoon",
  "good evening", "salamat", "thanks", "thank you", "ok", "okay", "sige", "oo", "yes", "no",
];

function has(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

/** A number that looks like money or a count, which transaction logs almost always carry. */
function hasFigure(text: string): boolean {
  return /\d/.test(text);
}

/**
 * A first guess from the wording alone, plus whether that guess can be trusted.
 *
 * The obvious cases are the common ones — "sold 10 jars to Nena" many times a day — and they
 * deserve to be free and instant. Everything else is handed to a model, because a keyword list
 * will always have phrasings it has never seen. "How much is cacao in the world market" was
 * one of those, and it went to the wrong place for exactly that reason.
 */
export function classifyIntent(raw: string): IntentGuess {
  const text = raw.trim().toLowerCase();
  if (!text) return { intent: "chat", confident: true };

  // Short and purely social: never worth a round trip to anything.
  if (text.split(/\s+/).length <= 3 && has(text, GREETINGS)) return { intent: "chat", confident: true };

  const isQuestion = text.includes("?") || has(text, QUESTION_OPENERS);
  const askingSomething = isQuestion || has(text, ADVICE_WORDS);
  const aboutAdviceTopic = has(text, ADVICE_TOPICS);
  const aboutOutsideWorld = has(text, EXTERNAL_TOPICS);
  const reportsEvent = has(text, TRANSACTION_WORDS);

  // A past-tense verb and a figure, with nothing being asked: this is a log, and it is the
  // single most frequent thing she types. Never spend a round trip deciding it.
  if (reportsEvent && hasFigure(text) && !askingSomething) return { intent: "transaction", confident: true };

  // Plainly about the world beyond her records, and nothing happened.
  if (aboutOutsideWorld && !reportsEvent && askingSomething) return { intent: "advice", confident: true };

  // Asking for a judgement is advice whatever the subject, and needs no second opinion.
  if (has(text, DECISION_PHRASES) && !reportsEvent) return { intent: "advice", confident: true };

  // Everything below is a guess. Say so, so the caller can ask a model instead.
  if (aboutOutsideWorld && !reportsEvent) return { intent: "advice", confident: false };
  if (reportsEvent && !askingSomething) return { intent: "transaction", confident: false };
  if (askingSomething && aboutAdviceTopic) return { intent: "advice", confident: false };
  if (has(text, ADVICE_WORDS)) return { intent: "advice", confident: false };

  return { intent: reportsEvent ? "transaction" : "chat", confident: false };
}
