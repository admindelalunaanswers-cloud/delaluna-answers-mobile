// src/schema/drawnTarotCard.schema.ts

import z from "zod";

/**
 * DrawnTarotCard
 * The simplified tarot card shape returned after a card draw.
 * This is what gets written into users/{uid}/horoscope/{date}.cards.
 */
export const DrawnTarotCardSchema = z.object({
  id: z.number(),            // card slug or ID
  name: z.string(),          // human-readable name
  imagePath: z.string(),     // firebase storage path / asset path
  reversed: z.boolean(),     // orientation
  keywords: z.array(z.string()), // upright or reversed keywords
  meaning: z.string(),       // upright or reversed meaning
});

export type DrawnTarotCard = z.infer<typeof DrawnTarotCardSchema>;
