import { DrawnTarotCard } from "../types/tarot-cards.type";
// import { DrawnTarotCard } from "@/schemas/drawnTarotCard.schema";

export interface DailyCardPack {
  date: string;                       // YYYY-MM-DD
  cards: DrawnTarotCard[];            // 1 or 3 cards
  keywordList: string[];              // flattened keywords
  keywordString: string;              // comma-separated
  meaningString: string;              // merged meaning text
  reversedCount: number;              // how many reversed cards
  uprightCount: number;               // how many upright cards
  createdAt: any;  // Firestore Timestamp (new) or number (legacy)
}