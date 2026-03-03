// src/schemas/TarotCardSchema.ts

import { z } from "zod";

export const TarotCardSchema = z.object({
  cardId: z.number().int().nonnegative(),
  cardName: z.string(),
  cardSlug: z.string(),
  imagePath: z.string(),

  reversed: z.boolean(),
  keywords: z.string(),
  meaning: z.string(),

  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string(),
  timestamp: z.number().int(),

  type: z.literal("daily"),
  status: z.enum(["pending", "processing", "complete", "error"]),

  prompt: z.string(),
});

export type ResolvedTarot = z.infer<typeof TarotCardSchema>;