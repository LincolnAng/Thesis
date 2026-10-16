import type { BotLanguage } from "@/lib/sheets/settings";

/**
 * How BAi should write in each language the Settings "Bot language" offers — one wording, used by
 * every AI feature that writes words the owner reads, so they can't drift apart.
 *
 * "Reply in Filipino" on its own gets textbook Tagalog: stiff, formal, and full of words nobody
 * says at a bazaar. What she reads should sound the way she and her buyers actually talk and text,
 * with the business words people normally say in English left in English.
 */
const RULES: Record<BotLanguage, string> = {
  english: "Write in plain, simple English — short sentences, everyday words, no jargon.",
  filipino:
    "Write in everyday Filipino (Tagalog), the conversational way people in the Philippines actually talk and text — not formal or textbook Tagalog. " +
    "Keep the business and food words people normally say in English in English (stock, order, batch, supplier, jar, bazaar, budget, sales, cost). " +
    "Don't write whole sentences in English, and never switch to Cebuano.",
  cebuano:
    "Write in everyday Cebuano (Bisaya), the conversational way people in Cebu and Mindanao actually talk and text — not formal or deep Bisaya. " +
    "Keep the business and food words people normally say in English in English (stock, order, batch, supplier, jar, bazaar, budget, sales, cost). " +
    "Don't write whole sentences in English, and never switch to Tagalog.",
};

/** The instruction for one language. Numbers, ₱ amounts, dates and product names stay as they are. */
export function languageRule(language: BotLanguage): string {
  return `${RULES[language] ?? RULES.english} Keep numbers, ₱ amounts, dates and product names exactly as given.`;
}
