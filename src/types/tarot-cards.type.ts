import { DailyCardPack } from "../models/daily-cards.model";


export interface TarotCard {
  id: number;                    // "the_fool"
  name: string;                  // "The Fool"
  number: number;                // 0–21 for major, 1–14 for minors
  arcana: "Major" | "Minor";
  suit?: "Wands" | "Cups" | "Swords" | "Pentacles";
  imagePath: string;
  uprightKeywords: string[];
  reversedKeywords: string[];
  uprightMeaning: string;
  reversedMeaning: string;
}

export interface DrawnTarotCard {
  id: number;
  name: string;
  imagePath: string;
  reversed: boolean;
  keywords: string[];
  meaning: string;
}

export interface TarotCardList {
  cards: DrawnTarotCard[];
}

export interface TarotDrawResult {
  yesterday: DailyCardPack;
  today: DailyCardPack;
  tomorrow: DailyCardPack;
}

export interface DailyDrawnTarotCard {
  date: string;
  cards: DrawnTarotCard[],
  keywordList: string[],
  keywordString: string;
  meaningString: string;
  reversedCount: number;
  uprightCount: number;
  createdAt: number;
  firstView: boolean;
}