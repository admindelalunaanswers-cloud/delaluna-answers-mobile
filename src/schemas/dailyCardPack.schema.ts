// src/schemas/dailyCardPack.schema.ts

import { z } from "zod";
import { DrawnTarotCardSchema } from "./drawnTarotCard.schema";

export const DailyCardPackSchema = z.object({
  date: z.string(),
  cards: z.array(DrawnTarotCardSchema),
  keywordList: z.array(z.string()),
  keywordString: z.string(),
  meaningString: z.string(),
  reversedCount: z.number(),
  uprightCount: z.number(),
  createdAt: z.number(),
  firstView: z.boolean().default(false), // false = not yet revealed (tap to reveal)
});

export type DailyCardPack = z.infer<typeof DailyCardPackSchema>;