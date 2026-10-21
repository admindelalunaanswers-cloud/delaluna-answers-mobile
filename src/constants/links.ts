// src/data/content/links.ts

export const CARD_LINKS = {
    amazon: {
        ORACLE_CARDS: "https://www.amazon.com/Delaluna-Answers-Oracle-Cards-Affirmations/dp/B0BNQT1SJ6?ref_=ast_sto_dp",
        TAROT_CARDS: "https://www.amazon.com/DELALUNA-ANSWERS-All-Gold-Tarot/dp/B0C24N8VPG?ref_=ast_sto_dp",
    }
} as const;

// ─── App store listings ──────────────────────────────────────────────────────
// iOS: the App Store Connect app ID (also eas.json's submit.production.ios.ascAppId).
// Android: android.package in app.config.js. Keep all three in step.
export const APP_STORE_ID = "6764196892";
export const PLAY_PACKAGE = "com.mobile.delaluna.answers";

export const STORE_LINKS = {
    ios: {
        /** Opens the App Store app on the listing. */
        listing: `itms-apps://apps.apple.com/app/id${APP_STORE_ID}`,
        review: `itms-apps://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`,
        /** For when the store app can't open. */
        web: `https://apps.apple.com/app/id${APP_STORE_ID}`,
        webReview: `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`,
    },
    android: {
        listing: `market://details?id=${PLAY_PACKAGE}`,
        review: `market://details?id=${PLAY_PACKAGE}`,
        web: `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`,
        webReview: `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`,
    },
} as const;
