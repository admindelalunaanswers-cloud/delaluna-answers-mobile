import { createHash, randomInt } from "crypto";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { defineSecret, projectID } from "firebase-functions/params";
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as nodemailer from "nodemailer";
import { ZodError, ZodType, z } from "zod";

import { generateWithAnchor, invalidateAnchor } from "./anchor";
import { runChatGeneration } from "./chat-generation";
import {
  archiveChatTurn,
  buildSavedSession,
  savedChatExpireAt,
} from "./chat-retention";
import {
  COMPATIBILITY_SCHEMA,
  NATAL_BREAKDOWN_SCHEMA,
  TRANSITS_SCHEMA,
  describeGenerationError,
  geminiApiKey,
  generateJson,
} from "./interactions";
import {
  BIRTH_CHART_BODIES,
  CHAT_REPLY_BODIES,
  COMPATIBILITY_BODIES,
  DAILY_HOROSCOPE_BODIES,
  TRANSIT_BODIES,
  pickPushBody,
} from "./push-copy";
import {
  recentHoroscopeQuotes,
  withQuoteDirection,
  withQuotesToAvoid,
} from "./quote-history";

// ─── Secrets (set via: firebase functions:secrets:set EMAIL_USER) ─────────────
const emailUser = defineSecret("EMAIL_USER");
const emailPass = defineSecret("EMAIL_PASS");

// Comma-separated list of admin email addresses. Held server-side only so
// rotation does not require shipping a new mobile build. Matched
// case-insensitively against the verified email on the caller's auth token.
const adminEmails = defineSecret("ADMIN_EMAILS");

// RevenueCat project Secret API key (RC dashboard > Project Settings > API
// Keys) — distinct from the public SDK keys shipped in the client app
// (REVENUECAT_*_API_KEY in expo config). This key can mutate any RC
// subscriber, so it is server-side only and must never reach the client.
const revenueCatSecretKey = defineSecret("REVENUECAT_KEY_V2");

// ─── Init ─────────────────────────────────────────────────────────────────────
admin.initializeApp();
const db = admin.firestore();

const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
console.log(
  `[functions] Running in ${isEmulator ? "EMULATOR (dev)" : "PRODUCTION"} mode`,
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

// 6-character alphanumeric OTP. Uses an ambiguity-free alphabet (no
// 0/O/1/I/L) so users transcribing from an email don't fat-finger a code,
// and crypto.randomInt for a uniform distribution — Math.random() is not
// suitable for security-sensitive randomness.
const OTP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars
function generateOtp(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += OTP_ALPHABET[randomInt(OTP_ALPHABET.length)];
  }
  return out;
}

function getOtpDocRef(uid: string) {
  return db.collection("emailVerification").doc(uid);
}

function buildTransporter(user: string, pass: string) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

// Validate a callable's `request.data` against a Zod schema. Throws an
// `invalid-argument` HttpsError with the first formatted issue on failure.
function parseInput<T>(schema: ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      const path = issue.path.join(".") || "<root>";
      throw new HttpsError(
        "invalid-argument",
        `Invalid input at "${path}": ${issue.message}`,
      );
    }
    throw err;
  }
}

// Constrain a free-form name to a Firestore-document-id-safe slug.
// - lowercase
// - alphanumerics + dashes only
// - collapse runs of unsafe chars to a single dash
// - trim leading/trailing dashes
// - cap to 40 chars
// Returns 'unknown' for empty results so we never produce a forbidden
// document id (Firestore rejects '', '.', '..', and ids containing '/').
function slugify(input: string): string {
  const cleaned = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || "unknown";
}

// Cap user-supplied LLM prompts and collapse control chars / whitespace.
// Caps at 32 KB - well under any model's context window and large enough
// for the compatibility-prompt template (5.7 KB) plus two ~8 KB natal-chart
// JSON payloads. Replaces ASCII control chars with spaces and folds
// whitespace runs so we don't slip terminator sequences through to the
// Handlebars-substituted prompt template.
//
// Newlines are deliberately preserved. Folding them into spaces flattened the
// chat prompt — persona, natal chart, subject context and the current message
// — into one unbroken paragraph, which is measurably harder for the model to
// segment. Runs are still capped at a single blank line, so the terminator-
// sequence concern the fold existed for is unchanged.
function sanitizePrompt(input: string | undefined, maxLen = 32000): string {
  if (!input) return "";
  return (
    input
      // Every ASCII control char except LF (\u000A) and CR (\u000D).
      .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, " ")
      .replace(/\r\n?/g, "\n")
      // Fold horizontal whitespace runs, leaving line structure intact.
      .replace(/[^\S\n]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .slice(0, maxLen)
      .trim()
  );
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

// Accept the same alphabet generateOtp emits (case-insensitive — the verifier
// uppercases before comparing). The literal class is the ambiguity-free set;
// keeping it permissive on the regex side guards against future alphabet
// tweaks without forcing a coordinated client deploy.
const VerifyCodeSchema = z.object({
  code: z
    .string()
    .regex(/^[A-Za-z0-9]{6}$/, "Code must be 6 letters or digits."),
});

const DeleteConnectionSchema = z.object({
  userId: z.string().min(1).max(128),
  connectionId: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_\-]+$/, "Invalid connectionId."),
});

// Entitlement identifiers this app is allowed to grant/revoke promotionally.
// Must match ENTITLEMENT_ID / FREE_TRIAL_ENTITLEMENT_ID in
// src/services/revenuecat.service.ts.
const KNOWN_ENTITLEMENT_IDS = ["Delaluna Answers Pro", "Pro-Trial"] as const;

// RevenueCat's promotional-entitlement duration enum (REST API v1).
const PROMOTIONAL_DURATIONS = [
  "daily",
  "three_day",
  "weekly",
  "monthly",
  "two_month",
  "three_month",
  "six_month",
  "yearly",
  "lifetime",
] as const;

/**
 * Features an admin can switch off for a single account.
 *
 * Only things that cost money to serve AND have a server-side chokepoint to
 * enforce at are listed: chat and tarot go through sendChatMessage, and
 * connections through createConnection. Horoscope and transits are deliberately
 * absent — they are generated by a client-side Firestore write the owner's own
 * rules permit, so there is nowhere to enforce a block, and a control that
 * records intent without changing behaviour is worse than no control.
 *
 * DUPLICATED in src/constants/moderation.ts for the client. Keep in step — the
 * client hides the UI, but this list is what the server actually enforces.
 */
const BLOCKABLE_FEATURES = ["chat", "tarot", "connections"] as const;

const SetUserDisabledSchema = z.object({
  targetUid: z.string().min(1).max(128),
  disabled: z.boolean(),
  // Free text, admin-authored. Stored for the next admin to read, never shown
  // to the user, so it is capped rather than sanitised for display.
  note: z.string().max(500).optional(),
});

const SetUserFeatureBlocksSchema = z.object({
  targetUid: z.string().min(1).max(128),
  blockedFeatures: z.array(z.enum(BLOCKABLE_FEATURES)).max(20),
  note: z.string().max(500).optional(),
});

const SetEntitlementOverrideSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("grant"),
    targetUid: z.string().min(1).max(128),
    entitlementId: z.enum(KNOWN_ENTITLEMENT_IDS),
    duration: z.enum(PROMOTIONAL_DURATIONS),
  }),
  z.object({
    action: z.literal("revoke"),
    targetUid: z.string().min(1).max(128),
    entitlementId: z.enum(KNOWN_ENTITLEMENT_IDS),
  }),
]);

const PersonSchema = z
  .object({
    "First Name": z.string().max(80).optional(),
    "Last Name": z.string().max(80).optional(),
    Pronouns: z.string().max(40).optional(),
    "Sun Sign": z.string().max(40).optional(),
    "Moon Sign": z.string().max(40).optional(),
    "Rising Sign": z.string().max(40).optional(),
    Birthday: z.string().max(40).optional(),
    "Time of Birth": z.string().max(40).optional(),
    "Place of Birth": z.string().max(200).optional(),
    birthLat: z.number().min(-90).max(90).nullable().optional(),
    birthLon: z.number().min(-180).max(180).nullable().optional(),
    birthTimezone: z.number().min(-14).max(14).nullable().optional(),
    isBirthTimeUnknown: z.boolean().optional(),
    isPlaceOfBirthUnknown: z.boolean().optional(),
  })
  .passthrough();

const CreateConnectionSchema = z.object({
  userId: z.string().min(1).max(128),
  isMe: z.boolean().optional().default(false),
  relationshipType: z.string().min(1).max(60),
  firstPerson: PersonSchema,
  secondPerson: PersonSchema,
  prompt: z.string().max(32000).optional(),
});

const SendChatMessageSchema = z.object({
  userMessage: z.string().min(1).max(4000),
  prompt: z.string().min(1).max(32000),
  /**
   * Which persona the conversation is running under. Stored so a saved or
   * resumed session keeps its mode; the prompt itself is built client-side, so
   * this is a label rather than something the server acts on.
   */
  mode: z.enum(["astrology", "tarot"]).optional(),
  connectionId: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_\-]+$/)
    .optional(),
  connectionName: z.string().max(200).optional(),
  /**
   * Id of a failed message being retried. When it points at a genuinely failed
   * generation the retry is not billed again — see sendChatMessage. Restricted
   * to plain id characters so it can't be used to walk out of the collection.
   */
  retryOf: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_\-]+$/, "Invalid message id.")
    .optional(),
});

// How many times a connection's birth details may be edited. Mirrors
// MAX_BIRTH_DETAIL_CHANGES in app/connection/[id]/edit.tsx; enforced in
// createConnection against a server-derived counter.
const MAX_BIRTH_DETAIL_CHANGES = 3;

// The person fields that count as "birth details" for that cap.
const BIRTH_DETAIL_FIELDS = [
  "birthday",
  "timeOfBirth",
  "placeOfBirth",
  "birthLat",
  "birthLon",
  "birthTimezone",
  "isBirthTimeUnknown",
  "isPlaceOfBirthUnknown",
] as const;

/** True when any birth-detail field differs between the stored and incoming person. */
function birthDetailsDiffer(
  stored: unknown,
  incoming: Record<string, unknown>,
): boolean {
  if (!stored || typeof stored !== "object") return false; // nothing to compare against
  const prev = stored as Record<string, unknown>;
  return BIRTH_DETAIL_FIELDS.some(
    (f) => (prev[f] ?? null) !== (incoming[f] ?? null),
  );
}

// ─── Chat quota ──────────────────────────────────────────────────────────────

// Daily question allowance, by entitlement. These mirror
// DEFAULT_DAILY_CHAT_LIMIT / DEFAULT_PREMIUM_DAILY_CHAT_LIMIT in
// src/context/admin-context.tsx, which drives the client-side UI counter.
//
// The admin screen's limit sliders persist to AsyncStorage — device-local, so
// they cannot reach the server. Admins are exempted from the quota entirely
// (see sendChatMessage) so that testing workflow still works without letting a
// client-side setting relax a server-side limit.
const FREE_DAILY_CHAT_LIMIT = 2;
const PREMIUM_DAILY_CHAT_LIMIT = 5;

// A chat document with no response older than this is treated as a failed
// generation, and only then may it be retried. Mirrored (plus a skew buffer)
// by RETRY_ELIGIBLE_MS in app/(main)/chat.tsx, which is what decides when the
// Retry button appears. Keep it comfortably longer than a slow generation:
// a retry deletes the document it replaces, so anything shorter risks
// discarding an answer that was about to arrive and paying Gemini twice.
const GENERATION_STUCK_MS = 3 * 60 * 1000;

// Consumable chat packs. Must match PRODUCT_IDS / CHAT_PACK_QUANTITIES in
// src/services/revenuecat.service.ts.
const CHAT_PACK_QUANTITIES: Record<string, number> = {
  "delaluna.iap.chat_pack_1": 1,
  "delaluna.iap.chat_pack_3": 3,
  "delaluna.iap.chat_pack_5": 5,
  "delaluna.iap.chat_pack_10": 10,
};

// ─── sendVerificationCode ─────────────────────────────────────────────────────

export const sendVerificationCode = onCall(
  { secrets: [emailUser, emailPass], invoker: "public" },

  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const uid = request.auth.uid;

    // Read the address off the Auth record, not request.auth.token.email — the
    // ID token is cached for up to an hour, so right after an email change the
    // token still carries the old address and we'd mail the code there.
    // verifyCode compares against this same source, so the two stay in step.
    const authUser = await admin.auth().getUser(uid);
    const email = authUser.email;

    if (!email) {
      throw new HttpsError("invalid-argument", "No email on account.");
    }

    // Keep the display mirror honest: an email change resets emailVerified on
    // the Auth record, but `users/{uid}.isEmailVerified` is server-only and
    // would otherwise still read true from a previous verification.
    if (!authUser.emailVerified) {
      await db
        .collection("users")
        .doc(uid)
        .set({ isEmailVerified: false }, { merge: true });
    }

    // Rate-limit: check if a code was sent in the last 60 seconds
    const existing = await getOtpDocRef(uid).get();
    if (existing.exists) {
      const data = existing.data()!;
      const sentAt: Timestamp = data.sentAt;
      if (sentAt) {
        const secondsAgo = (Date.now() - sentAt.toMillis()) / 1000;
        if (secondsAgo < 60) {
          throw new HttpsError(
            "resource-exhausted",
            `Please wait ${Math.ceil(60 - secondsAgo)} seconds before requesting a new code.`,
          );
        }
      }
    }

    const code = generateOtp();
    const expiresAt = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);

    await getOtpDocRef(uid).set({
      code,
      email,
      expiresAt,
      sentAt: FieldValue.serverTimestamp(),
      attempts: 0,
    });

    const transporter = buildTransporter(emailUser.value(), emailPass.value());

    await transporter.sendMail({
      from: `"Delaluna Answers" <${emailUser.value()}>`,
      to: email,
      subject: "Your Delaluna verification code",
      html: `
        <div style="background:#0d0d1a;padding:40px 24px;font-family:sans-serif;color:#e6e9f0;max-width:480px;margin:0 auto;border-radius:12px;">
          <h2 style="color:#a78bfa;margin:0 0 8px;">Delaluna Answers</h2>
          <p style="color:#9ca3af;margin:0 0 32px;font-size:14px;">Your cosmic journey awaits</p>

          <p style="margin:0 0 16px;">Enter this code in the app to verify your email:</p>

          <div style="background:#1a1a2e;border:1px solid rgba(167,139,250,0.4);border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
            <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#a78bfa;">${code}</span>
          </div>

          <p style="color:#6b7280;font-size:13px;margin:0;">This code expires in <strong style="color:#e6e9f0;">15 minutes</strong>. If you didn't sign up for Delaluna, you can safely ignore this email.</p>
        </div>
      `,
    });

    return { sent: true };
  },
);

// ─── verifyCode ───────────────────────────────────────────────────────────────

export const verifyCode = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const uid = request.auth.uid;
  const { code } = parseInput(VerifyCodeSchema, request.data);

  const otpRef = getOtpDocRef(uid);

  // Bind the code to the mailbox it was actually delivered to. Without this a
  // user could request a code at an address they own, change the account email
  // (edit-profile calls updateEmail, which drops emailVerified back to false),
  // then redeem the old code to get emailVerified=true on an address they have
  // never proven ownership of — which syncAdminClaim would then treat as proof
  // for the ADMIN_EMAILS allowlist.
  //
  // Read the address off the Auth record rather than request.auth.token.email:
  // the ID token is cached for up to an hour, so a token minted before the
  // email change would still carry the old address.
  const authUser = await admin.auth().getUser(uid);
  const currentEmail = (authUser.email ?? "").toLowerCase();

  // The check and the attempt it spends happen in one transaction. Read, compare
  // and increment as separate steps let parallel guesses all read the same
  // `attempts` and each pass the limit, so the five-guess cap held only for a
  // caller who waited for each answer. Contended transactions retry, so every
  // guess now sees the count the previous one left.
  //
  // Errors are returned rather than thrown: a throw inside the callback aborts
  // the transaction, and with it the delete or increment that has to land.
  type Outcome =
    | { ok: true }
    | { ok: false; error: HttpsError };
  const outcome = await db.runTransaction(async (tx): Promise<Outcome> => {
    const snap = await tx.get(otpRef);

    if (!snap.exists) {
      return {
        ok: false,
        error: new HttpsError(
          "not-found",
          "No verification code found. Please request a new one.",
        ),
      };
    }

    const data = snap.data()!;
    const expiresAt: Timestamp = data.expiresAt;
    const attempts: number = data.attempts ?? 0;
    const issuedTo = String(data.email ?? "").toLowerCase();

    if (!issuedTo || !currentEmail || issuedTo !== currentEmail) {
      // The code is dead — it belongs to an address no longer on this account.
      tx.delete(otpRef);
      return {
        ok: false,
        error: new HttpsError(
          "failed-precondition",
          "Your email address changed after this code was sent. Please request a new one.",
        ),
      };
    }

    if (attempts >= 5) {
      tx.delete(otpRef);
      return {
        ok: false,
        error: new HttpsError(
          "resource-exhausted",
          "Too many attempts. Please request a new code.",
        ),
      };
    }

    if (expiresAt.toMillis() < Date.now()) {
      tx.delete(otpRef);
      return {
        ok: false,
        error: new HttpsError(
          "deadline-exceeded",
          "Code has expired. Please request a new one.",
        ),
      };
    }

    if (data.code !== code.toUpperCase()) {
      tx.update(otpRef, { attempts: attempts + 1 });
      const remaining = 4 - attempts;
      return {
        ok: false,
        error: new HttpsError(
          "invalid-argument",
          remaining > 0
            ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
            : "Incorrect code.",
        ),
      };
    }

    // Spent here, inside the transaction, so a correct code cannot be redeemed
    // twice by two parallel calls.
    tx.delete(otpRef);
    return { ok: true };
  });

  if (!outcome.ok) throw outcome.error;

  // Code is correct — mark email as verified. `set` with merge (not `update`)
  // so this doesn't throw NOT_FOUND if the users/{uid} doc is ever missing
  // or out of sync with the Auth user (e.g. cleared independently in a
  // local emulator, or a signup that errored after creating the Auth user).
  await admin.auth().updateUser(uid, { emailVerified: true });
  await db
    .collection("users")
    .doc(uid)
    .set({ isEmailVerified: true }, { merge: true });

  return { verified: true };
});

// ─── syncAdminClaim ──────────────────────────────────────────────────────────

/**
 * Idempotently reconciles the caller's admin status against the server-side
 * email allowlist (`ADMIN_EMAILS` secret). Sets the `admin: true` custom
 * auth claim when the verified email matches, removes it otherwise.
 * Mirrors `users/{uid}.isAdmin` so existing UI hints still work; security
 * rules MUST gate on `request.auth.token.admin == true`, not the doc field.
 *
 * The client should call this on every app start and force-refresh the ID
 * token after a successful response (`user.getIdToken(true)`) so the new
 * claim takes effect immediately.
 */
export const syncAdminClaim = onCall(
  { secrets: [adminEmails], invoker: "public" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const uid = request.auth.uid;

    // Source the identity from the Auth record, not request.auth.token. The ID
    // token is cached for up to an hour, so a token issued before an email
    // change (or before emailVerified was reset by one) can misrepresent both
    // fields — and this is the function that hands out the admin claim.
    const userRecord = await admin.auth().getUser(uid);
    const email = (userRecord.email ?? "").toLowerCase();
    const emailVerified = userRecord.emailVerified === true;

    const allowed = adminEmails
      .value()
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const shouldBeAdmin = emailVerified && !!email && allowed.includes(email);

    const existingClaims = (userRecord.customClaims ?? {}) as Record<
      string,
      unknown
    >;
    const isCurrentlyAdmin = existingClaims.admin === true;

    if (shouldBeAdmin === isCurrentlyAdmin) {
      return { admin: shouldBeAdmin, changed: false };
    }

    const nextClaims: Record<string, unknown> = { ...existingClaims };
    if (shouldBeAdmin) {
      nextClaims.admin = true;
    } else {
      delete nextClaims.admin;
    }
    await admin.auth().setCustomUserClaims(uid, nextClaims);

    // Mirror to Firestore for client-side UI (e.g. showing the admin tab).
    // Privilege itself is enforced via the auth claim, not this field.
    await db
      .collection("users")
      .doc(uid)
      .set({ isAdmin: shouldBeAdmin }, { merge: true });

    // uid is enough to identify the account here; the email address is PII and
    // this line runs on every sign-in that flips the claim.
    console.log(`[syncAdminClaim] uid=${uid} -> admin=${shouldBeAdmin}`);

    return { admin: shouldBeAdmin, changed: true };
  },
);

// ─── revokeMyRefreshTokens ───────────────────────────────────────────────────

/**
 * Revokes all refresh tokens for the calling user. The current ID token stays
 * valid until it expires (~1h) — for stricter immediate enforcement, pair with
 * a rules-level `request.auth.token.auth_time > revoke_time` check on
 * high-sensitivity collections.
 *
 * Called from the client on user-initiated logout, account deletion, and
 * password change so other devices/sessions cannot continue using stale
 * refresh tokens after a credential change.
 */
export const revokeMyRefreshTokens = onCall(
  { invoker: "public" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }
    await admin.auth().revokeRefreshTokens(request.auth.uid);
    return { revoked: true };
  },
);

// ─── sendMorningReminder ──────────────────────────────────────────────────────

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const PUSH_CHUNK_SIZE = 100;

interface ExpoPushMessage {
  to: string;
  sound: "default" | null;
  title: string;
  body: string;
  channelId?: string;
  data?: Record<string, string>;
  priority?: "default" | "normal" | "high";
  _contentAvailable?: boolean;
}

/**
 * Runs every day at 8:00 AM UTC.
 * Queries all users with a saved Expo push token and sends a morning reminder.
 */
/**
 * Runs every day at midnight UTC.
 *
 * Moves every open-thread turn older than 24 hours into the user's saved chat
 * history, then clears it from the thread. The chat screen still starts fresh
 * each day and the replay stays short — this used to *delete* those turns
 * outright, so anything the user hadn't parked with "+" before midnight was
 * gone, which cannot square with a 60-day access window (chat-retention.ts).
 *
 * One saved session per user per night. Turns that never got an answer
 * (pending past GENERATION_STUCK_MS, or failed) are dropped as before; they
 * have nothing to read and the archive only holds answered turns anyway.
 */
export const clearDailyChatHistory = onSchedule("every day 00:00", async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(
    Date.now() - 24 * 60 * 60 * 1000,
  );

  const snap = await db
    .collectionGroup("updayedChat")
    .where("createTime", "<", cutoff)
    .get();

  if (snap.empty) return;

  const byUser = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const d of snap.docs) {
    const userRef = d.ref.parent.parent;
    if (!userRef) continue;
    const list = byUser.get(userRef.id) ?? [];
    list.push(d);
    byUser.set(userRef.id, list);
  }

  const BATCH_SIZE = 500;
  let parked = 0;
  let failed = 0;
  for (const [uid, docs] of byUser) {
    // One user's failure must not strand everyone after them; their turns are
    // still in the thread and tomorrow's run picks them up again.
    try {
      const session = buildSavedSession(
        docs.map((d) => ({ id: d.id, data: d.data() })),
      );
      // The session lands in the same batch as the first deletes, so a run
      // that dies part way can't leave the turns both saved and still live —
      // which tomorrow would save a second time.
      for (let i = 0; i < docs.length; i += BATCH_SIZE - 1) {
        const batch = db.batch();
        if (i === 0 && session) {
          batch.set(
            db.collection("users").doc(uid).collection("savedChats").doc(),
            session,
          );
        }
        docs.slice(i, i + BATCH_SIZE - 1).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      if (session) parked++;
    } catch (err) {
      failed++;
      console.error(`[clearDailyChatHistory] park failed for user ${uid}`, err);
    }
  }
  console.info(
    `[clearDailyChatHistory] parked ${parked} threads, ${failed} failed`,
  );
});

// ─── Chat retention ──────────────────────────────────────────────────────────

/**
 * Copies every answered chat turn into the four-year legal archive
 * (chat-retention.ts). Fires on the update that writes `response` — a resumed
 * session's turns are *created* with their response already in place, so they
 * never reach here and are not archived twice.
 *
 * `retry: true` because a missed copy is a hole in a legal record, not a
 * cosmetic glitch; archiveChatTurn is idempotent, so a redelivery is harmless.
 */
export const archiveChatReply = onDocumentUpdated(
  { document: "users/{userId}/updayedChat/{messageId}", retry: true },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after?.response || !after.userMessage) return;
    if (before?.response === after.response) return;

    await archiveChatTurn(event.params.userId, event.params.messageId, after);
  },
);

/**
 * Stamps `expireAt` on a saved chat that arrived without one — every session a
 * client saves, since only the server decides when access ends. The TTL policy
 * on `savedChats.expireAt` (firestore.indexes.json) does the removal.
 *
 * Overwrites a client-supplied value too: otherwise a modified client could
 * keep its history past the window by writing a far-future date.
 */
export const stampSavedChatExpiry = onDocumentCreated(
  "users/{userId}/savedChats/{sessionId}",
  async (event) => {
    const snap = event.data;
    const data = snap?.data();
    if (!snap || !data) return;

    const expireAt = savedChatExpireAt(data);
    if (!expireAt) return;
    if (
      data.expireAt instanceof Timestamp &&
      data.expireAt.toMillis() === expireAt.toMillis()
    ) {
      return;
    }
    await snap.ref.update({ expireAt });
  },
);

// Silent midnight rollover hour in user local time. The client treats this as
// a hint to pre-generate today's horoscope so it's ready by morning.
const ROLLOVER_PUSH_LOCAL_HOUR = 0;

// Each user is assigned a stable per-UID hour in [HOUR_BASE, HOUR_BASE + HOUR_SPAN)
// so we don't blast every user at exactly 8:00 AM (Expo throttles, and we'd also
// burst Google AI generation if the rollover/horoscope generation kicks in).
const HOUR_BASE = 8; // earliest local hour
const HOUR_SPAN = 3; // 8,9,10
const SUNDAY = 0; // Date.getUTCDay()
const THURSDAY = 4; // Date.getUTCDay()

// Premium entitlement id used by RevenueCat (must match the entitlement
// configured in the RC dashboard and used by useRevenueCat().isPro).
const PREMIUM_ENTITLEMENT_ID = "Delaluna Answers Pro";

// Skip chat-reply pushes if the user was active in the last 30s — they're
// almost certainly looking at the chat screen and don't need a notification.
const CHAT_FOREGROUND_GRACE_MS = 30_000;

// For longer-running generations (connection reports, synastry, transits) the
// AI can take 60-180s. Use a 3-minute window so a user watching the loading
// screen isn't notified, but one who backgrounded the app is.
const GENERATION_FOREGROUND_GRACE_MS = 3 * 60 * 1000;

/** Real UTC offsets run from −12:00 (Baker Island) to +14:00 (Kiribati). */
const MIN_UTC_OFFSET_MINUTES = -12 * 60;
const MAX_UTC_OFFSET_MINUTES = 14 * 60;

/**
 * The UTC offset, in minutes, that chat billing uses to name the user's day:
 * the stored `timezoneOffsetMinutes` when it is a real offset, else 0 (UTC).
 *
 * The user writes that field, and every distinct day id is a fresh daily
 * allowance, so an unchecked value let any user mint new days — and new
 * questions — at will by writing a new offset. Within the real range the most a
 * change can do is reach the neighbouring day. Mirrored by `billingOffsetMinutes`
 * in src/services/chat.service.ts; keep the two in step, or the client watches a
 * different ledger document than the one being charged.
 */
function billingOffsetMinutes(offsetMinutes: unknown): number {
  return typeof offsetMinutes === "number" &&
    Number.isInteger(offsetMinutes) &&
    offsetMinutes >= MIN_UTC_OFFSET_MINUTES &&
    offsetMinutes <= MAX_UTC_OFFSET_MINUTES
    ? offsetMinutes
    : 0;
}

/**
 * Returns the user's current local hour (0-23) given a UTC offset in minutes.
 * Returns null if the offset is missing or invalid.
 */
function localHourFromOffset(
  nowUtc: Date,
  offsetMinutes: unknown,
): number | null {
  if (typeof offsetMinutes !== "number" || !Number.isFinite(offsetMinutes))
    return null;
  const localMinutes =
    nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes() + offsetMinutes;
  const wrapped = ((localMinutes % 1440) + 1440) % 1440;
  return Math.floor(wrapped / 60);
}

/**
 * Returns the user's current local day-of-week (0=Sunday … 6=Saturday) given
 * a UTC offset in minutes. Returns null if the offset is missing or invalid.
 */
function localDayOfWeek(nowUtc: Date, offsetMinutes: unknown): number | null {
  if (typeof offsetMinutes !== "number" || !Number.isFinite(offsetMinutes))
    return null;
  const localMs = nowUtc.getTime() + offsetMinutes * 60 * 1000;
  return new Date(localMs).getUTCDay();
}

/**
 * Stable FNV-1a hash of `uid + salt` used to spread per-user push timing
 * across the HOUR_SPAN window. Same uid always maps to the same hour, so
 * a given user gets their daily horoscope at the same local time every day.
 */
function hashUid(uid: string, salt = ""): number {
  let h = 2166136261;
  const s = uid + salt;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function jitterHour(uid: string, salt: string): number {
  return HOUR_BASE + (hashUid(uid, salt) % HOUR_SPAN);
}

/**
 * The Firebase project that must only honour purchases somebody paid for.
 *
 * One RevenueCat project (proj4ac9ef9a) serves both Firebase projects, and it
 * includes a Test Store app, whose purchases are free by design. Its public key
 * shipped readable in every build until it was gated on the test backend, so
 * anyone could configure the SDK with it, log in as their own uid and "buy" a
 * chat pack or a subscription. The same is true of App Store and Play sandbox
 * purchases, which any TestFlight tester can make against production.
 *
 * The test project keeps honouring them: that is how QA buys things.
 */
const PRODUCTION_PROJECT_ID = "delaluna-answers";

// Accounts whose sandbox purchases still count in production: the App Store
// review login. Apple reviews against the production backend with sandbox
// purchases, so without this a reviewer's chat pack shows in the app and is then
// refused by the server, which reads as a broken purchase. Uids, not emails,
// because both callers already have the uid. Comma-separated, held in Secret
// Manager like ADMIN_EMAILS so the account stays out of the repo:
//   firebase functions:secrets:set REVIEW_ACCOUNT_UIDS
// Every function that reaches isUserPremium or purchasedChatCredits must list
// it in `secrets`. It is read only in production; the test project needs the
// secret to exist for the deploy, but its value is never consulted there.
const reviewAccountUids = defineSecret("REVIEW_ACCOUNT_UIDS");

function isReviewAccount(uid: string): boolean {
  return (reviewAccountUids.value() ?? "")
    .split(",")
    .some((entry) => entry.trim() === uid);
}

function honoursUnpaidPurchases(uid: string): boolean {
  return projectID.value() !== PRODUCTION_PROJECT_ID || isReviewAccount(uid);
}

/**
 * True for a v1 subscriber purchase record (a `non_subscriptions` entry or a
 * `subscriptions` value) that RevenueCat marks as sandbox or Test Store.
 *
 * It denies only what is positively marked unpaid. The mirror's shape has never
 * been checked against a real record (see CLAUDE.md), so requiring the flags to
 * be present would zero every paying user's credits if they turned out to be
 * missing. The flags are written by RevenueCat, not the client, so an attacker
 * cannot strip them.
 */
function isUnpaidPurchase(record: unknown): boolean {
  if (!record || typeof record !== "object") return false;
  const { is_sandbox: isSandbox, store } = record as {
    is_sandbox?: unknown;
    store?: unknown;
  };
  return isSandbox === true || store === "test_store";
}

/**
 * Server-side premium check. Reads the RevenueCat extension's purchaser-info
 * mirror and returns true if the user has the active "Delaluna Answers Pro"
 * entitlement. Returns false on any error so we never push premium content
 * to non-premium users by mistake.
 *
 * In production an entitlement backed only by a sandbox or Test Store purchase
 * does not count. The v1 entitlement carries no sandbox flag of its own, so it
 * is read off the purchase its `product_identifier` names.
 */
async function isUserPremium(uid: string): Promise<boolean> {
  try {
    const snap = await db
      .doc(`subscriptions/purchaser-info/customers/${uid}`)
      .get();
    const data = snap.data();
    const ent =
      data?.subscriber?.entitlements?.[PREMIUM_ENTITLEMENT_ID] ??
      data?.entitlements?.[PREMIUM_ENTITLEMENT_ID];
    if (!ent) return false;

    if (!honoursUnpaidPurchases(uid)) {
      const subscriber = data?.subscriber ?? data;
      const productId = ent.product_identifier ?? ent.productIdentifier;
      const subscription = subscriber?.subscriptions?.[productId];
      const oneTime = subscriber?.non_subscriptions?.[productId];
      if (isUnpaidPurchase(subscription)) return false;
      if (
        Array.isArray(oneTime) &&
        oneTime.length > 0 &&
        oneTime.every(isUnpaidPurchase)
      ) {
        return false;
      }
    }

    const expires = ent.expires_date ?? ent.expiresDate;
    if (!expires) return true; // lifetime / non-subscription purchase
    return new Date(expires).getTime() > Date.now();
  } catch {
    return false;
  }
}

/**
 * Enqueues a push to be delivered at or after `sendAfter`. Picked up by the
 * hourly job (drainScheduledPushes). Resolution is roughly 1 hour — a push
 * scheduled for 1:23 PM local will go out at the next hourly tick after that.
 *
 * Pass `docId` to make the enqueue idempotent — a deterministic ID means a
 * Cloud Function retry overwrites the existing entry instead of creating a
 * second one, preventing duplicate notifications.
 */
async function enqueueDelayedPush(
  userId: string,
  sendAfter: Date,
  payload: PushPayload,
  docId?: string,
): Promise<void> {
  const ref = docId
    ? db.collection("scheduledPushes").doc(docId)
    : db.collection("scheduledPushes").doc();
  await ref.set({
    userId,
    sendAfter: Timestamp.fromDate(sendAfter),
    payload,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Sends any due `scheduledPushes` and deletes them. Resolves the user's
 * current Expo push token at send time so a token rotation between enqueue
 * and send still delivers. Returns the count sent (for logging).
 */
async function drainScheduledPushes(now: Date): Promise<number> {
  const due = await db
    .collection("scheduledPushes")
    .where("sendAfter", "<=", Timestamp.fromDate(now))
    .limit(500)
    .get();

  if (due.empty) return 0;

  const messages: ExpoPushMessage[] = [];
  const docsToDelete: FirebaseFirestore.DocumentReference[] = [];

  for (const doc of due.docs) {
    const { userId, payload } = doc.data() as {
      userId: string;
      payload: PushPayload;
    };
    docsToDelete.push(doc.ref);
    if (!userId || !payload) continue;

    const userSnap = await db.collection("users").doc(userId).get();
    const token = userSnap.data()?.expoPushToken as string | undefined;
    if (!token) continue;

    messages.push({
      to: token,
      sound: "default",
      title: payload.title,
      body: payload.body,
      channelId: "default",
      data: payload.data ?? {},
      priority: "high",
      _contentAvailable: true,
    });
  }

  for (let i = 0; i < messages.length; i += PUSH_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + PUSH_CHUNK_SIZE);
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(chunk),
    });
  }

  // Always delete drained queue docs (even if push failed) so we don't loop
  // forever on a permanently-bad token.
  const BATCH = 500;
  for (let i = 0; i < docsToDelete.length; i += BATCH) {
    const batch = db.batch();
    docsToDelete.slice(i, i + BATCH).forEach((r) => batch.delete(r));
    await batch.commit();
  }

  return messages.length;
}

/**
 * Runs every hour. For each user with a push token + saved timezone offset,
 * decides which (if any) of these notifications to send based on the user's
 * own stable per-UID jitter hour:
 *
 *  - Local midnight (rollover): silent data-only push so the client can
 *    pre-generate today's horoscope before morning.
 *  - Local horoscope hour (6-10 AM): visible daily horoscope reminder.
 *  - Sunday at local transits hour (6-10 AM): weekly transits reminder.
 *  - Sunday and Thursday at local connections hour (6-10 AM): connection
 *    report refresh. Premium users with at least one connection only.
 *    Thursday is the "weekend romance report"; Sunday is the weekly update.
 *
 * Also drains the scheduledPushes queue (used by the connection-report flow
 * to randomize delivery into the afternoon).
 */
export const dailyHoroscopeNotifications = onSchedule(
  // The secret: this reaches isUserPremium (see REVIEW_ACCOUNT_UIDS).
  { schedule: "every 1 hours", secrets: [reviewAccountUids] },
  async () => {
    const now = new Date();
    const messages: ExpoPushMessage[] = [];

    // Rotates the body copy once per UTC day. Every user in this run shares the
    // key, so the salt still has to carry the uid to avoid sending the whole
    // user base the same line.
    const copyDayKey = now.toISOString().slice(0, 10);

    const snap = await db
      .collection("users")
      .where("expoPushToken", "!=", null)
      .get();

    for (const userDoc of snap.docs) {
      const data = userDoc.data();
      const uid = userDoc.id;
      const token = data.expoPushToken as string | undefined;
      if (!token) continue;

      const offset = data.timezoneOffsetMinutes;
      const localHour = localHourFromOffset(now, offset);
      const localDay = localDayOfWeek(now, offset);
      if (localHour === null || localDay === null) continue;

      // Skip periodic notifications for accounts created in the last 24 hours.
      // New users receive targeted notifications (notifyBreakdownReady, etc.)
      // from Firestore triggers — the scheduled job would double-notify them
      // if they happen to register during a notification window.
      const createdAt = data.createdAt as Timestamp | undefined;
      if (
        createdAt &&
        now.getTime() - createdAt.toMillis() < 24 * 60 * 60 * 1000
      )
        continue;

      // Truly silent data-only push at midnight — wakes the app to pre-generate
      // today's horoscope before morning. No sound, no banner.
      if (localHour === ROLLOVER_PUSH_LOCAL_HOUR) {
        messages.push({
          to: token,
          sound: null,
          title: "",
          body: "",
          data: { action: "rollover-horoscope" },
          priority: "high",
          _contentAvailable: true,
        });
        continue;
      }

      const horoHour = jitterHour(uid, "horoscope");
      const txHour = jitterHour(uid, "transits");
      const cxHour = jitterHour(uid, "connections");

      if (localHour === horoHour) {
        messages.push({
          to: token,
          sound: "default",
          title: "🌙 Your Daily Reading",
          body: pickPushBody(
            DAILY_HOROSCOPE_BODIES,
            hashUid(uid, `horoscope-copy:${copyDayKey}`),
          ),
          channelId: "default",
          data: { screen: "/(main)" },
          priority: "high",
          _contentAvailable: true,
        });
      }

      if (localDay === SUNDAY && localHour === txHour) {
        messages.push({
          to: token,
          sound: "default",
          title: "✨ This Week in the Stars",
          body: pickPushBody(
            TRANSIT_BODIES,
            hashUid(uid, `transits-copy:${copyDayKey}`),
          ),
          channelId: "default",
          data: { screen: "/(main)/transits" },
          priority: "high",
          _contentAvailable: true,
        });
      }

      if (
        (localDay === SUNDAY || localDay === THURSDAY) &&
        localHour === cxHour
      ) {
        // Premium-gated and only relevant if the user has at least one established
        // connection (created more than 24 hours ago). Connections without a
        // createTime field are legacy/pre-date the field — treat them as established.
        const cutoff24h = Timestamp.fromDate(
          new Date(now.getTime() - 24 * 60 * 60 * 1000),
        );
        const [premium, cxSnap] = await Promise.all([
          isUserPremium(uid),
          userDoc.ref.collection("connections").limit(10).get(),
        ]);
        const hasEstablishedConnection = cxSnap.docs.some((d) => {
          const ct = d.data().createTime as Timestamp | undefined;
          return !ct || ct.toMillis() <= cutoff24h.toMillis();
        });
        if (premium && hasEstablishedConnection) {
          // The two runs are distinct products, so the titles differ — and the
          // dedupe pass below keys on title, so identical titles on the same
          // token would collapse into one. The body rotates out of the shared
          // compatibility pool; the day key keeps Thursday and Sunday apart.
          const isWeekendRomance = localDay === THURSDAY;
          messages.push({
            to: token,
            sound: "default",
            title: isWeekendRomance
              ? "💘 Weekend Romance Report"
              : "💞 Weekly Connection Update",
            body: pickPushBody(
              COMPATIBILITY_BODIES,
              hashUid(uid, `connections-copy:${copyDayKey}`),
            ),
            channelId: "default",
            data: { screen: "/(main)/connections" },
            priority: "high",
            _contentAvailable: true,
          });
        }
      }
    }

    // Collapse duplicates before sending. The loop above iterates user docs,
    // but a single device token can sit on more than one doc (a dev/test
    // account signed in and abandoned without logging out keeps its token) —
    // without this the device receives the same reminder once per stale doc.
    const seen = new Set<string>();
    const unique = messages.filter((m) => {
      const key = `${m.to}|${m.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Send the timing-based pushes.
    for (let i = 0; i < unique.length; i += PUSH_CHUNK_SIZE) {
      const chunk = unique.slice(i, i + PUSH_CHUNK_SIZE);
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(chunk),
      });
    }

    // Drain any due delayed pushes (connection-report afternoon randomization, etc).
    const drained = await drainScheduledPushes(now);

    console.info(
      `[dailyHoroscopeNotifications] sent ${unique.length} timed ` +
        `(${messages.length - unique.length} deduped) + ${drained} drained pushes`,
    );
  },
);

// ─── setEntitlementOverride ─────────────────────────────────────────────────

/**
 * Admin-only. Grants or revokes a RevenueCat promotional entitlement for an
 * arbitrary user (Firebase UID == RC App User ID, see revenuecat.service.ts
 * loginUser()). Calls RevenueCat's REST API v1 directly with the project's
 * Secret API key — this key can mutate ANY subscriber, so this function
 * must remain strictly admin-gated.
 *
 * Does not write to Firestore itself: the RevenueCat Firebase Extension's
 * webhook mirror (`subscriptions/purchaser-info/customers/{uid}`) reflects
 * the change shortly after RC processes it. Callers should re-fetch that
 * doc after a short delay rather than trust this response as Firestore's
 * source of truth.
 */
export const setEntitlementOverride = onCall(
  { secrets: [revenueCatSecretKey], invoker: "public" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }
    if (request.auth.token?.admin !== true) {
      throw new HttpsError("permission-denied", "Admin privileges required.");
    }

    const input = parseInput(SetEntitlementOverrideSchema, request.data);
    const encodedUid = encodeURIComponent(input.targetUid);
    const encodedEntitlement = encodeURIComponent(input.entitlementId);

    const url =
      input.action === "grant"
        ? `https://api.revenuecat.com/v1/subscribers/${encodedUid}/entitlements/${encodedEntitlement}/promotional`
        : `https://api.revenuecat.com/v1/subscribers/${encodedUid}/entitlements/${encodedEntitlement}/revoke_promotionals`;

    const res = await fetch(url, {
      method: input.action === "grant" ? "POST" : "DELETE",
      headers: {
        Authorization: `Bearer ${revenueCatSecretKey.value()}`,
        "Content-Type": "application/json",
      },
      ...(input.action === "grant"
        ? { body: JSON.stringify({ duration: input.duration }) }
        : {}),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      console.error(
        `[setEntitlementOverride] RC API error (${res.status}) uid=${input.targetUid} action=${input.action}:`,
        json,
      );
      if (res.status === 404) {
        throw new HttpsError("not-found", "RevenueCat subscriber not found.");
      }
      if (res.status === 400 || res.status === 422) {
        throw new HttpsError(
          "invalid-argument",
          json?.message ?? "RevenueCat rejected the request.",
        );
      }
      throw new HttpsError("internal", "RevenueCat API request failed.");
    }

    console.info(
      `[setEntitlementOverride] admin=${request.auth.uid} ${input.action}ed "${input.entitlementId}" for targetUid=${input.targetUid}`,
    );

    return {
      success: true,
      entitlements: json?.subscriber?.entitlements ?? {},
    };
  },
);

// ─── Moderation helpers ──────────────────────────────────────────────────────

/**
 * Shared guard for the moderation callables. Returns the calling admin's uid.
 *
 * Refuses to let an admin act on their own account. Every one of these actions
 * is self-destructive when self-applied — disabling yourself locks you out of
 * the dashboard that would undo it — and there is no legitimate reason to do
 * it, so it is cheaper to forbid than to explain.
 */
function requireAdminActingOnOther(
  request: { auth?: { uid: string; token: Record<string, unknown> } },
  targetUid: string,
): string {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  if (request.auth.token?.admin !== true) {
    throw new HttpsError("permission-denied", "Admin privileges required.");
  }
  if (request.auth.uid === targetUid) {
    throw new HttpsError(
      "failed-precondition",
      "You cannot apply moderation actions to your own account.",
    );
  }
  return request.auth.uid;
}

/** Rejects moderating another admin, so two admins cannot lock each other out. */
async function assertTargetIsNotAdmin(targetUid: string): Promise<void> {
  let target;
  try {
    target = await admin.auth().getUser(targetUid);
  } catch {
    throw new HttpsError("not-found", "No such user.");
  }
  if ((target.customClaims ?? {}).admin === true) {
    throw new HttpsError(
      "failed-precondition",
      "That account is an admin. Remove it from ADMIN_EMAILS first.",
    );
  }
}

// ─── setUserDisabled ─────────────────────────────────────────────────────────

/**
 * Disables or re-enables an account at the Firebase Auth level.
 *
 * Disabling alone is not immediate: an already-issued ID token stays valid for
 * up to an hour, so a signed-in user would keep working until it expired.
 * `revokeRefreshTokens` closes that window — the SDK's next refresh fails and
 * the app drops to signed-out. Re-enabling deliberately does NOT un-revoke;
 * the user simply signs in again.
 *
 * `moderation/{uid}.disabled` is written as a mirror for the dashboard to read.
 * Firebase Auth is the authority; the field exists so the user list can show
 * state without an Auth lookup per row. It lives in `moderation/`, not on the
 * user document, because that document is delete-able by its owner.
 */
export const setUserDisabled = onCall(
  { invoker: "public" },
  async (request) => {
    // Before parsing, so a caller who isn't an admin learns nothing about the
    // input format from validation errors.
    requireAdminCaller(request);
    const input = parseInput(SetUserDisabledSchema, request.data);
    const adminUid = requireAdminActingOnOther(request, input.targetUid);
    await assertTargetIsNotAdmin(input.targetUid);

    await admin
      .auth()
      .updateUser(input.targetUid, { disabled: input.disabled });

    if (input.disabled) {
      // Order matters: disable first, then revoke. Revoking first would leave a
      // window where the user could obtain a fresh token from a still-enabled
      // account and keep it for another hour.
      await admin.auth().revokeRefreshTokens(input.targetUid);
    }

    await db
      .collection("moderation")
      .doc(input.targetUid)
      .set(
        {
          disabled: input.disabled,
          note: input.note ?? "",
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: adminUid,
        },
        { merge: true },
      );

    // Both uids are document keys, not PII. The note is admin free-text and is
    // deliberately not logged.
    console.info(
      `[setUserDisabled] admin=${adminUid} set disabled=${input.disabled} for targetUid=${input.targetUid}`,
    );

    return { success: true, disabled: input.disabled };
  },
);

// ─── setUserFeatureBlocks ────────────────────────────────────────────────────

/**
 * Replaces the set of features blocked for one account.
 *
 * The array is replaced wholesale rather than added to, so the dashboard sends
 * the complete desired state and two admins editing at once cannot merge into
 * a union neither of them intended.
 *
 * Enforcement is split, and both halves are required:
 *   - server: sendChatMessage refuses a blocked mode (the half that matters —
 *     it is what stops the Gemini spend)
 *   - client: src/constants/moderation.ts drives the UI so a blocked feature
 *     reads as unavailable instead of silently erroring
 */
export const setUserFeatureBlocks = onCall(
  { invoker: "public" },
  async (request) => {
    // Before parsing — see setUserDisabled.
    requireAdminCaller(request);
    const input = parseInput(SetUserFeatureBlocksSchema, request.data);
    const adminUid = requireAdminActingOnOther(request, input.targetUid);
    await assertTargetIsNotAdmin(input.targetUid);

    const unique = [...new Set(input.blockedFeatures)];

    await db
      .collection("moderation")
      .doc(input.targetUid)
      .set(
        {
          blockedFeatures: unique,
          note: input.note ?? "",
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: adminUid,
        },
        { merge: true },
      );

    console.info(
      `[setUserFeatureBlocks] admin=${adminUid} set [${unique.join(",")}] for targetUid=${input.targetUid}`,
    );

    return { success: true, blockedFeatures: unique };
  },
);

// ─── deleteConnection ─────────────────────────────────────────────────────────

export const deleteConnection = onCall(
  { invoker: "public" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const { userId, connectionId } = parseInput(
      DeleteConnectionSchema,
      request.data,
    );

    // Only allow users to delete their own connections
    if (request.auth.uid !== userId) {
      throw new HttpsError(
        "permission-denied",
        "You can only delete your own connections.",
      );
    }

    const connectionRef = db
      .collection("users")
      .doc(userId)
      .collection("connections")
      .doc(connectionId);

    const snap = await connectionRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Connection not found.");
    }

    // The document and everything under it. A plain delete() left the
    // `report` and `synastryReading` subcollections orphaned — still holding
    // both people's names, birth details and the readings, with no parent
    // document left to find them by. Safe for the triggers on those paths:
    // the generators bail when the document no longer exists, and the push
    // triggers are onDocumentUpdated, which deletes don't fire.
    await db.recursiveDelete(connectionRef);

    return { deleted: true };
  },
);

// ─── submitFeedback ───────────────────────────────────────────────────────────
// Saves in-app feedback to `feedback/{id}` and emails it to the admin inbox.
//
// A callable rather than a client write, like sendChatMessage: the input is
// validated and throttled here, the contact address is read off the Auth record
// (only with the user's consent), and `feedback` stays server-only in the rules.
// The email is best-effort — feedback is saved even if the mail fails, and the
// doc records which happened (`email.status`), so nothing is lost silently.

const FEEDBACK_ADMIN_EMAIL = "admin.delalunaanswers@gmail.com";
const FEEDBACK_MIN_INTERVAL_MS = 60 * 1000;

const FeedbackOption = z.string().trim().min(1).max(40);
const SubmitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  loved: z.array(FeedbackOption).max(20),
  improve: z.array(FeedbackOption).max(20),
  comment: z.string().max(2000),
  allowFollowUp: z.boolean(),
  appVersion: z.string().max(40).optional(),
  platform: z.string().max(40).optional(),
});

/** User text goes into an HTML email; never interpolate it raw. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const submitFeedback = onCall(
  { secrets: [emailUser, emailPass], invoker: "public" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }
    const uid = request.auth.uid;
    const input = parseInput(SubmitFeedbackSchema, request.data);
    const comment = input.comment.trim();

    // Only with consent, and off the Auth record — the ID token can carry a
    // stale address for up to an hour after an email change.
    const contactEmail = input.allowFollowUp
      ? ((await admin.auth().getUser(uid)).email ?? null)
      : null;

    const throttleRef = db.collection("feedbackThrottle").doc(uid);
    const feedbackRef = db.collection("feedback").doc();

    await db.runTransaction(async (tx) => {
      const throttle = await tx.get(throttleRef);
      const lastAt = throttle.exists
        ? (throttle.data()?.lastAt as Timestamp | undefined)
        : undefined;
      if (lastAt && Date.now() - lastAt.toMillis() < FEEDBACK_MIN_INTERVAL_MS) {
        throw new HttpsError(
          "resource-exhausted",
          "Please wait a minute before sending more feedback.",
        );
      }
      tx.set(throttleRef, { lastAt: FieldValue.serverTimestamp() });
      tx.set(feedbackRef, {
        uid,
        rating: input.rating,
        loved: input.loved,
        improve: input.improve,
        comment,
        allowFollowUp: input.allowFollowUp,
        contactEmail,
        appVersion: input.appVersion ?? null,
        platform: input.platform ?? null,
        createdAt: FieldValue.serverTimestamp(),
        email: { status: "pending" },
      });
    });

    const list = (items: string[]) =>
      items.length ? items.map(escapeHtml).join(", ") : "<em>none</em>";
    const row = (label: string, value: string) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#9ca3af;vertical-align:top;">${label}</td><td style="padding:4px 0;">${value}</td></tr>`;

    try {
      const transporter = buildTransporter(emailUser.value(), emailPass.value());
      await transporter.sendMail({
        from: `"Delaluna Answers" <${emailUser.value()}>`,
        to: FEEDBACK_ADMIN_EMAIL,
        // Reply straight to the user — but only if they allowed follow-up.
        ...(contactEmail ? { replyTo: contactEmail } : {}),
        subject: `Feedback: ${input.rating}/5${comment ? " — with comment" : ""}`,
        html: `
          <div style="font-family:sans-serif;color:#111;max-width:560px;">
            <h2 style="margin:0 0 12px;">New in-app feedback</h2>
            <table style="border-collapse:collapse;font-size:14px;">
              ${row("Rating", `${input.rating} / 5`)}
              ${row("Loved", list(input.loved))}
              ${row("Improve", list(input.improve))}
              ${row("Follow-up", contactEmail ? `Yes — ${escapeHtml(contactEmail)}` : "Not allowed")}
              ${row("App", escapeHtml(`${input.appVersion ?? "?"} (${input.platform ?? "?"})`))}
              ${row("User", escapeHtml(uid))}
              ${row("Feedback ID", escapeHtml(feedbackRef.id))}
            </table>
            <h3 style="margin:20px 0 6px;">Comment</h3>
            <p style="white-space:pre-wrap;margin:0;">${comment ? escapeHtml(comment) : "<em>No comment.</em>"}</p>
          </div>
        `,
      });
      await feedbackRef.update({
        "email.status": "sent",
        "email.sentAt": FieldValue.serverTimestamp(),
      });
    } catch (err) {
      // The shape, not the contents: no comment, no address. SMTP errors can
      // echo recipients, so only the error code is logged.
      console.error("[submitFeedback] admin email failed", {
        uid,
        feedbackId: feedbackRef.id,
        code: (err as { code?: string })?.code ?? "unknown",
      });
      await feedbackRef.update({ "email.status": "failed" });
    }

    return { id: feedbackRef.id };
  },
);

// ─── createConnection ─────────────────────────────────────────────────────────

export const createConnection = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const {
    userId,
    isMe,
    relationshipType,
    firstPerson,
    secondPerson,
    prompt: clientPrompt,
  } = parseInput(CreateConnectionSchema, request.data);

  // Only allow users to create connections under their own user doc
  if (request.auth.uid !== userId) {
    throw new HttpsError(
      "permission-denied",
      "You can only create your own connections.",
    );
  }

  // Moderation gate. This callable is the only path that creates a connection
  // and the compatibility generation it triggers, so it is the one place a
  // "connections" block has to bite. Admins are exempt, as everywhere else.
  if (request.auth.token.admin !== true) {
    const modSnap = await db.collection("moderation").doc(userId).get();
    const blocked = (modSnap.data()?.blockedFeatures ?? []) as string[];
    if (blocked.includes("connections")) {
      throw new HttpsError(
        "permission-denied",
        "This feature is not available on your account.",
      );
    }
  }

  type ValidatedPerson = z.infer<typeof PersonSchema>;
  const mapPerson = (p: ValidatedPerson) => ({
    firstName: p["First Name"] ?? "",
    lastName: p["Last Name"] ?? "",
    pronouns: p["Pronouns"] ?? "",
    sun: p["Sun Sign"] ?? "",
    moon: p["Moon Sign"] ?? "",
    rising: p["Rising Sign"] ?? "",
    birthday: p["Birthday"] ?? "",
    timeOfBirth: p["Time of Birth"] ?? "",
    placeOfBirth: p["Place of Birth"] ?? "",
    birthLat: typeof p.birthLat === "number" ? p.birthLat : null,
    birthLon: typeof p.birthLon === "number" ? p.birthLon : null,
    birthTimezone: typeof p.birthTimezone === "number" ? p.birthTimezone : null,
    isBirthTimeUnknown: !!p.isBirthTimeUnknown,
    isPlaceOfBirthUnknown: !!p.isPlaceOfBirthUnknown,
  });

  let mappedFirst = mapPerson(firstPerson);

  if (isMe) {
    const chartSnap = await db
      .collection("users")
      .doc(userId)
      .collection("natalChart")
      .doc("details")
      .get();
    if (chartSnap.exists) {
      const chart = chartSnap.data()!;
      const sunPlanet = (chart.planets as any[])?.find(
        (p: any) => p.name === "Sun",
      );
      mappedFirst = {
        ...mappedFirst,
        sun: sunPlanet?.sign ?? mappedFirst.sun,
        moon: chart.moon?.sign ?? mappedFirst.moon,
        rising: chart.ascendant?.sign ?? mappedFirst.rising,
      };
    }
  }

  const mappedSecond = mapPerson(secondPerson);

  const prompt = sanitizePrompt(clientPrompt);

  const firstSlug = `${slugify(mappedFirst.firstName)}_${slugify(mappedFirst.lastName)}`;
  const secondSlug = `${slugify(mappedSecond.firstName)}_${slugify(mappedSecond.lastName)}`;
  const connectionId = `${firstSlug}-${secondSlug}`;

  const connectionRef = db
    .collection("users")
    .doc(userId)
    .collection("connections")
    .doc(connectionId);

  const reportRef = connectionRef.collection("report").doc("details");

  const existingSnap = await connectionRef.get();
  const isNew = !existingSnap.exists;
  const existing = existingSnap.data();

  // Birth-detail edits are capped (MAX_BIRTH_DETAIL_CHANGES in
  // app/connection/[id]/edit.tsx). The counter is derived here rather than
  // accepted from the client — otherwise a caller could simply resubmit
  // birthDetailsChangeCount: 0 on every edit and never hit the cap.
  const priorChangeCount = Number(existing?.birthDetailsChangeCount ?? 0);
  const birthDetailsChanged =
    !isNew &&
    (birthDetailsDiffer(existing?.firstPerson, mappedFirst) ||
      birthDetailsDiffer(existing?.secondPerson, mappedSecond));

  if (birthDetailsChanged && priorChangeCount >= MAX_BIRTH_DETAIL_CHANGES) {
    throw new HttpsError(
      "resource-exhausted",
      `Connection birth details can only be updated ${MAX_BIRTH_DETAIL_CHANGES} times.`,
    );
  }

  const nextChangeCount = birthDetailsChanged
    ? priorChangeCount + 1
    : priorChangeCount;

  await connectionRef.set(
    {
      connectionId,
      isMe: !!isMe,
      relationshipType,
      firstPerson: mappedFirst,
      secondPerson: mappedSecond,
      status: { state: "pending" },
      birthDetailsChangeCount: nextChangeCount,
      // Stamp createTime only on first creation; preserve it on edits
      ...(isNew ? { createTime: FieldValue.serverTimestamp() } : {}),
      // Clear any previous compatibility so the UI shows pending until the new report parses
      compatibility: FieldValue.delete(),
    },
    { merge: true },
  );

  // Write the prompt to a child doc the chatbot extension watches in isolation.
  // Single doc per connection in its own subcollection ⇒ no prior turns to inherit.
  await reportRef.set(
    {
      prompt,
      response: FieldValue.delete(),
      requestedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // The anchor profile lists saved connections, so it is now out of date —
  // drop it and let the next generation rebuild with this person included.
  await invalidateAnchor(userId);

  return { connectionId };
});

// ─── sendChatMessage ─────────────────────────────────────────────────────────

/**
 * Counts the chat-pack questions a user has ever bought, from the RevenueCat
 * extension's purchaser-info mirror (`subscriber.non_subscriptions` — the v1
 * subscriber record of consumable purchases, one entry per purchase).
 *
 * Returns 0 if the mirror is missing or shaped unexpectedly, which fails
 * closed: the user falls back to their daily allowance only.
 */
async function purchasedChatCredits(uid: string): Promise<number> {
  try {
    const snap = await db
      .doc(`subscriptions/purchaser-info/customers/${uid}`)
      .get();
    const data = snap.data();
    const nonSubs =
      data?.subscriber?.non_subscriptions ?? data?.non_subscriptions;
    if (!nonSubs || typeof nonSubs !== "object") return 0;

    // Sandbox and Test Store packs cost nothing; production doesn't count them.
    // See PRODUCTION_PROJECT_ID.
    const countUnpaid = honoursUnpaidPurchases(uid);

    let total = 0;
    for (const [productId, purchases] of Object.entries(nonSubs)) {
      const perPurchase = CHAT_PACK_QUANTITIES[productId];
      if (!perPurchase) continue; // not a chat pack
      const records: unknown[] = Array.isArray(purchases)
        ? purchases
        : [purchases];
      const counted = countUnpaid
        ? records
        : records.filter((p) => !isUnpaidPurchase(p));
      total += perPurchase * counted.length;
    }
    return total;
  } catch (err) {
    console.error(`[sendChatMessage] credit lookup failed for ${uid}:`, err);
    return 0;
  }
}

/**
 * Hands back the question a chat message was billed for, at most once.
 *
 * The charge has to happen when the message is submitted — the quota is only
 * enforceable before the generation starts — but a user should only pay for an
 * answer they actually received. So a generation that ends in ERROR, or one
 * superseded by a retry, refunds itself here.
 *
 * Idempotent through the `refunded` flag on the message: the ERROR trigger and
 * an explicit retry can both reach this for the same document, and only the
 * first moves the ledger. The counters are recomputed and floored at zero
 * rather than blindly decremented, so even a refund that somehow ran twice
 * cannot manufacture allowance out of nothing.
 */
async function refundChatQuestion(
  uid: string,
  msgRef: admin.firestore.DocumentReference,
): Promise<void> {
  const usageRef = db.collection("users").doc(uid).collection("chatUsage");

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(msgRef);
      if (!snap.exists) return;

      const data = snap.data()!;
      // Only sendChatMessage can write a non-empty prompt (the rules allow a
      // client create only with `prompt == ''`) and nothing ever clears one, so
      // this is what proves the receipt below was stamped by the server. A
      // client may create a prompt-less message carrying any fields it likes —
      // without this check a forged `billedDay` / `billedCredit` plus a retry
      // refunded a question that was never charged, and repeating it gave
      // unlimited chat and refilled spent credits.
      if (typeof data.prompt !== "string" || !data.prompt) return;

      const dayId = data.billedDay;
      // Nothing was charged: an admin send, or a message written before
      // billing receipts existed.
      if (typeof dayId !== "string" || !dayId) return;
      if (data.refunded === true) return;

      const fromCredit = data.billedCredit === true;
      const dayRef = usageRef.doc(dayId);
      const creditsRef = usageRef.doc("_credits");

      // Every read before any write — a transaction rejects the other order.
      const daySnap = await tx.get(dayRef);
      const creditsSnap = fromCredit ? await tx.get(creditsRef) : null;

      tx.set(
        dayRef,
        {
          count: Math.max(0, Number(daySnap.data()?.count ?? 0) - 1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (creditsSnap) {
        tx.set(
          creditsRef,
          {
            consumed: Math.max(
              0,
              Number(creditsSnap.data()?.consumed ?? 0) - 1,
            ),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      tx.set(msgRef, { refunded: true }, { merge: true });
    });
  } catch (err) {
    // A failed refund must not fail the retry that asked for it — that would
    // leave the user both charged and unable to get the answer. The ledger
    // stays one high in that case, which is the survivable direction.
    console.error(`[chat] refund failed for ${uid}:`, err);
  }
}

/**
 * The only path that may submit a chat prompt for AI generation.
 *
 * Previously the client wrote straight into `users/{uid}/updayedChat` and the
 * Gemini extension picked it up, so the paywall and the daily question limit
 * were enforced in React state only — any user could drive unlimited paid
 * generation by writing to Firestore with their own credentials. Firestore
 * rules now reject client-written prompts; the quota is enforced here.
 *
 * Usage is tracked in `users/{uid}/chatUsage/{YYYY-MM-DD}` rather than by
 * counting chat documents, because the client can delete its own chat history
 * (clearChatHistory / deleteChatSession) and would otherwise reset its quota
 * at will. That collection is server-write-only.
 *
 * A question is charged here, before the generation runs, but is only ever
 * kept for an answer that arrived: a failure refunds it (refundFailedChat),
 * and so does the retry that supersedes it.
 */
export const sendChatMessage = onCall(
  // The secret: this reaches isUserPremium and purchasedChatCredits.
  { invoker: "public", secrets: [reviewAccountUids] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }
    if (request.auth.token.email_verified !== true) {
      throw new HttpsError(
        "permission-denied",
        "Please verify your email address first.",
      );
    }

    const uid = request.auth.uid;
    const input = parseInput(SendChatMessageSchema, request.data);

    const userRef = db.collection("users").doc(uid);
    const usageRef = userRef.collection("chatUsage");
    const chatRef = userRef.collection("updayedChat");

    // Admins are exempt — they already hold a full read/write claim, so metering
    // them adds nothing, and it keeps the admin screen's limit sliders usable.
    const isAdmin = request.auth.token.admin === true;

    // Moderation gate. This is the half of feature-blocking that actually bites:
    // the client hides blocked features, but only this stops a modified or stale
    // build from spending Gemini budget. Read before any billing happens so a
    // blocked user is never charged for a question that will not be answered.
    //
    // A tarot turn is blocked by either "tarot" or "chat" — tarot rides the chat
    // pipeline, so blocking chat and leaving tarot open would be a hole rather
    // than a finer-grained setting.
    if (!isAdmin) {
      const modSnap = await db.collection("moderation").doc(uid).get();
      const blocked = (modSnap.data()?.blockedFeatures ?? []) as string[];
      const wanted = input.mode === "tarot" ? ["tarot", "chat"] : ["chat"];
      if (wanted.some((f) => blocked.includes(f))) {
        throw new HttpsError(
          "permission-denied",
          "This feature is not available on your account.",
        );
      }
    }

    // A retry must never start a second generation for a message that is still
    // in flight. It used to: a message only counted as failed once it was in the
    // extension's ERROR state or older than GENERATION_STUCK_MS, and a retry
    // arriving before then fell straight through to the billing below — charging
    // a second question and adding a second document, so the user saw their
    // question and two separate replies and paid twice for one answer. The
    // client only offers the button once the message is eligible, but clock skew
    // can beat it there, so the refusal is enforced here.
    if (input.retryOf) {
      const prevRef = chatRef.doc(input.retryOf);
      const prev = await prevRef.get();

      if (!prev.exists) {
        // An eligible retry consumes the document it replaces, so a missing one
        // means this is the second tap on the same button.
        throw new HttpsError(
          "failed-precondition",
          "That message has already been retried.",
        );
      }

      const prevData = prev.data()!;

      // Only a message this function submitted can be retried. Anything with an
      // empty prompt was written by the client — a restored turn, or a forgery
      // whose `status` and `createTime` say whatever it wants — and the retry
      // below would delete it and refund against it. See refundChatQuestion.
      if (typeof prevData.prompt !== "string" || !prevData.prompt) {
        throw new HttpsError(
          "failed-precondition",
          "That message can't be retried.",
        );
      }

      const state = String(prevData.status?.state ?? "").toUpperCase();
      const createdMs =
        (prevData.createTime as Timestamp | undefined)?.toMillis() ?? 0;
      const stuck =
        !prevData.response &&
        createdMs > 0 &&
        Date.now() - createdMs > GENERATION_STUCK_MS;

      if (state !== "ERROR" && !stuck) {
        throw new HttpsError(
          "failed-precondition",
          "That answer is still generating. Give it a moment.",
        );
      }

      // The failed turn hands its question back instead of the retry being
      // waived. Same net cost — one question for one answer — but the new
      // document carries its own billing record, so a retry that fails in turn
      // is refunded too rather than the chain leaking a question per failure.
      // The refund is awaited, so the ledger the transaction below reads has
      // already been credited and a user at their limit is not bounced to the
      // paywall for a question they never got an answer to.
      await refundChatQuestion(uid, prevRef);
      await prevRef.delete();
    }

    // What this message was billed for, recorded on the document so it can be
    // handed back if the generation fails. Null when nothing was charged.
    let billed: { dayId: string; fromCredit: boolean } | null = null;

    if (!isAdmin) {
      const [premium, purchased, userSnap] = await Promise.all([
        isUserPremium(uid),
        purchasedChatCredits(uid),
        userRef.get(),
      ]);

      // Bill against the user's local day so the quota resets at their midnight,
      // matching what the in-app counter shows.
      const offset = billingOffsetMinutes(userSnap.data()?.timezoneOffsetMinutes);
      const nowLocal = new Date(Date.now() + offset * 60 * 1000);
      const dayId = formatDateId(nowLocal);

      const dailyLimit = premium
        ? PREMIUM_DAILY_CHAT_LIMIT
        : FREE_DAILY_CHAT_LIMIT;

      // Read-modify-write in a transaction so parallel sends can't both pass the
      // check and overspend the allowance. What it charged is returned rather
      // than assigned from inside, because a contended transaction runs its
      // callback more than once.
      billed = await db.runTransaction(async (tx) => {
        const dayRef = usageRef.doc(dayId);
        const creditsRef = usageRef.doc("_credits");
        const [daySnap, creditsSnap] = await Promise.all([
          tx.get(dayRef),
          tx.get(creditsRef),
        ]);

        const usedToday = Number(daySnap.data()?.count ?? 0);
        const creditsSpent = Number(creditsSnap.data()?.consumed ?? 0);
        const creditsLeft = Math.max(0, purchased - creditsSpent);

        if (usedToday < dailyLimit) {
          tx.set(
            dayRef,
            {
              count: FieldValue.increment(1),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          return { dayId, fromCredit: false };
        }

        if (creditsLeft > 0) {
          // Daily allowance is spent — draw down a purchased chat-pack question.
          tx.set(
            creditsRef,
            {
              consumed: FieldValue.increment(1),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          tx.set(
            dayRef,
            {
              count: FieldValue.increment(1),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          return { dayId, fromCredit: true };
        }

        throw new HttpsError(
          "resource-exhausted",
          "You've used all your questions. Purchase a chat pack to keep going.",
        );
      });
    }

    const payload: Record<string, unknown> = {
      userMessage: input.userMessage,
      prompt: sanitizePrompt(input.prompt),
      createTime: FieldValue.serverTimestamp(),
    };
    if (input.connectionId) payload.connectionId = input.connectionId;
    if (input.connectionName) payload.connectionName = input.connectionName;
    if (input.mode) payload.mode = input.mode;
    // The receipt refundChatQuestion reads. Absent for an admin send, which is
    // never metered and so has nothing to give back.
    if (billed) {
      payload.billedDay = billed.dayId;
      payload.billedCredit = billed.fromCredit;
    }

    const created = await chatRef.add(payload);

    return { messageId: created.id };
  },
);

// ─── Push helper ─────────────────────────────────────────────────────────────

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Sends a single Expo push notification and logs the response.
 * Logs Expo Push API errors (DeviceNotRegistered, InvalidCredentials, etc.)
 * so we can diagnose why a push didn't arrive.
 */
async function sendExpoPush(
  userId: string,
  token: string,
  payload: PushPayload,
  context: string,
): Promise<void> {
  const message = {
    to: token,
    sound: "default" as const,
    title: payload.title,
    body: payload.body,
    channelId: "default",
    data: payload.data ?? {},
    priority: "high" as const,
    _contentAvailable: true,
  };

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(message),
    });

    const json = await res.json().catch(() => null);

    // Expo returns 200 even when individual messages have errors — check the data array
    const ticket = json?.data?.[0] ?? json?.data;
    if (ticket?.status === "error") {
      console.error(
        `[${context}] Push ticket error for user ${userId}:`,
        ticket,
      );
    }
  } catch (err) {
    console.error(`[${context}] Push send failed for user ${userId}:`, err);
  }
}

// ─── notifyBreakdownReady ────────────────────────────────────────────────────

/**
 * When the Firebase Extension writes a `response` to the natal chart breakdown
 * document, send a push notification to the user — works whether the app is
 * in the foreground, background, or killed.
 */
export const notifyBreakdownReady = onDocumentUpdated(
  "users/{userId}/natalChart/details",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const userId = event.params.userId;

    // Only fire when a new response appears
    if (!after?.response) {
      console.info(`[notifyBreakdownReady] Skip — no response field on doc`);
      return;
    }
    if (before?.response === after.response) {
      console.info(`[notifyBreakdownReady] Skip — response unchanged`);
      return;
    }

    const userSnap = await db.collection("users").doc(userId).get();
    const userData = userSnap.data();
    const token = userData?.expoPushToken as string | undefined;
    if (!token) {
      console.info(
        `[notifyBreakdownReady] Skip — user ${userId} has no expoPushToken`,
      );
      return;
    }
    // Check the Auth record, not users/{uid}.isEmailVerified — the mirror is a
    // display field that can lag an email change, and historically the client
    // could seed it at signup.
    const verified = await admin
      .auth()
      .getUser(userId)
      .then((u) => u.emailVerified)
      .catch(() => false);
    if (!verified) {
      console.info(
        `[notifyBreakdownReady] Skip — user ${userId} email not verified`,
      );
      return;
    }

    await sendExpoPush(
      userId,
      token,
      {
        title: "Your Birth Chart is Ready",
        body: pickPushBody(
          BIRTH_CHART_BODIES,
          hashUid(userId, "birth-chart-copy"),
        ),
        data: { screen: "/(home)/birth-chart-view" },
      },
      "notifyBreakdownReady",
    );
  },
);

// ─── refundFailedChat ────────────────────────────────────────────────────────

/**
 * Gives the question back when a generation fails.
 *
 * Without this a failed turn still cost the user a question, whether or not
 * they ever pressed Retry — the charge is taken at submit time and nothing
 * reversed it. Fires on the extension's ERROR status rather than waiting for a
 * retry, so a user who simply gives up is not billed for silence either.
 */
export const refundFailedChat = onDocumentUpdated(
  "users/{userId}/updayedChat/{messageId}",
  async (event) => {
    const after = event.data?.after;
    const afterData = after?.data();
    if (!after || !afterData) return;

    const state = String(afterData.status?.state ?? "").toUpperCase();
    if (state !== "ERROR") return;
    // An error written alongside a response still answered the question.
    if (afterData.response) return;
    // Only on the transition into ERROR; refundChatQuestion is idempotent
    // anyway, but there is no reason to open a transaction per later write.
    const beforeState = String(
      event.data?.before?.data()?.status?.state ?? "",
    ).toUpperCase();
    if (beforeState === "ERROR") return;

    await refundChatQuestion(event.params.userId, after.ref);
  },
);

// ─── notifyChatReply ─────────────────────────────────────────────────────────

/**
 * When the Firebase Extension writes a `response` to a chat message doc,
 * send a push notification so the user sees the reply even if the app is
 * backgrounded or killed. Skipped if the user is still foregrounded
 * (lastActiveAt within CHAT_FOREGROUND_GRACE_MS) — they're presumably
 * staring at the chat screen and the in-app live update is enough.
 */
export const notifyChatReply = onDocumentUpdated(
  "users/{userId}/updayedChat/{messageId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const userId = event.params.userId;

    if (!after?.response) return;
    if (before?.response === after.response) return;

    const userSnap = await db.collection("users").doc(userId).get();
    const userData = userSnap.data();
    const token = userData?.expoPushToken as string | undefined;
    if (!token) return;

    const lastActiveAt = userData?.lastActiveAt as Timestamp | undefined;
    if (
      lastActiveAt &&
      Date.now() - lastActiveAt.toMillis() < CHAT_FOREGROUND_GRACE_MS
    ) {
      console.info(`[notifyChatReply] Skip — user ${userId} foregrounded`);
      return;
    }

    await sendExpoPush(
      userId,
      token,
      {
        title: "New Message",
        body: pickPushBody(
          CHAT_REPLY_BODIES,
          hashUid(userId, `chat-copy:${event.params.messageId}`),
        ),
        data: { screen: "/(main)/chat" },
      },
      "notifyChatReply",
    );
  },
);

// ─── notifySynastryReady ─────────────────────────────────────────────────────

/**
 * Push when the synastry reading extension writes back its `response` field.
 * Only fires if the app is backgrounded — if the user is watching the loading
 * screen the in-app listener handles the update without a push.
 */
export const notifySynastryReady = onDocumentUpdated(
  "users/{userId}/connections/{connectionId}/synastryReading/{docId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const { userId, connectionId } = event.params;

    if (!after?.response) return;
    if (before?.response === after.response) return;

    const userSnap = await db.collection("users").doc(userId).get();
    const userData = userSnap.data();
    const token = userData?.expoPushToken as string | undefined;
    if (!token) return;

    const lastActiveAt = userData?.lastActiveAt as Timestamp | undefined;
    if (
      lastActiveAt &&
      Date.now() - lastActiveAt.toMillis() < GENERATION_FOREGROUND_GRACE_MS
    ) {
      console.info(`[notifySynastryReady] Skip — user ${userId} foregrounded`);
      return;
    }

    await sendExpoPush(
      userId,
      token,
      {
        title: "Synastry Reading Ready",
        body: "Your relationship breakdown is in. Tap to see how your charts compare.",
        data: { screen: "/connection/[id]/synastry", connectionId },
      },
      "notifySynastryReady",
    );
  },
);

// ─── notifyTransitsReady ──────────────────────────────────────────────────────

/**
 * Push when the transits extension writes back its `response` field — covers
 * manual regenerations. Skipped if the user is still in the foreground
 * (watching the loading state). Sunday scheduled reminders are handled
 * separately by dailyHoroscopeNotifications.
 */
export const notifyTransitsReady = onDocumentUpdated(
  "users/{userId}/transits/{dateId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const { userId } = event.params;

    if (!after?.response) return;
    if (before?.response === after.response) return;

    const userSnap = await db.collection("users").doc(userId).get();
    const userData = userSnap.data();
    const token = userData?.expoPushToken as string | undefined;
    if (!token) return;

    const lastActiveAt = userData?.lastActiveAt as Timestamp | undefined;
    if (
      lastActiveAt &&
      Date.now() - lastActiveAt.toMillis() < GENERATION_FOREGROUND_GRACE_MS
    ) {
      console.info(`[notifyTransitsReady] Skip — user ${userId} foregrounded`);
      return;
    }

    await sendExpoPush(
      userId,
      token,
      {
        title: "✨ Transit Reading Ready",
        body: pickPushBody(
          TRANSIT_BODIES,
          hashUid(userId, `transits-ready-copy:${event.params.dateId}`),
        ),
        data: { screen: "/(main)/transits" },
      },
      "notifyTransitsReady",
    );
  },
);

// ─── parseConnectionCompatibility ────────────────────────────────────────────

/**
 * Parses the AI compatibility response into the parent connection doc. If the
 * user is backgrounded, enqueues a randomly-timed afternoon push (12-5 PM
 * local) so it feels like a check-in rather than an instant system ping.
 * Skipped entirely when the user is still in the foreground.
 */
export const parseConnectionCompatibility = onDocumentUpdated(
  "users/{userId}/connections/{connectionId}/report/{reportId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const { userId, connectionId } = event.params;

    if (!after?.response) return;
    if (before?.response === after.response) return;

    const connectionRef = db
      .collection("users")
      .doc(userId)
      .collection("connections")
      .doc(connectionId);

    let parseOk = false;
    try {
      const raw = after.response as string;
      const clean = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      const parsed = JSON.parse(clean);

      await connectionRef.update({
        compatibility: parsed,
        "status.state": "complete",
      });
      // Scores feed the anchor profile's "strongest / weakest" line.
      await invalidateAnchor(userId);
      parseOk = true;
    } catch (err) {
      // The shape, not the contents: a JSON.parse error quotes the text it
      // failed on, and this text is a reading of two named people with their
      // birth details. Cloud Logging would keep it.
      const reason = err instanceof Error ? err.name : "unknown";
      const length = typeof after.response === "string" ? after.response.length : 0;
      console.error(
        `[parseConnectionCompatibility] Parse error — ${reason}, response ${length} chars`,
      );
      await connectionRef.update({
        "status.state": "error",
      });
    }

    if (!parseOk) return;

    const userSnap = await db.collection("users").doc(userId).get();
    const userData = userSnap.data();

    // Skip push entirely if the user is still looking at the app — the
    // in-app real-time listener will surface the result without a notification.
    const lastActiveAt = userData?.lastActiveAt as Timestamp | undefined;
    if (
      lastActiveAt &&
      Date.now() - lastActiveAt.toMillis() < GENERATION_FOREGROUND_GRACE_MS
    ) {
      console.info(
        `[parseConnectionCompatibility] Skip push — user ${userId} foregrounded`,
      );
      return;
    }

    // Enqueue a randomly-timed afternoon push (12-5 PM user local). The hourly
    // drain delivers it on the next tick at-or-after the chosen time.
    const offset = userData?.timezoneOffsetMinutes;
    if (typeof offset !== "number" || !Number.isFinite(offset)) {
      // No timezone — send immediately so they at least find out.
      const token = userData?.expoPushToken as string | undefined;
      if (token) {
        await sendExpoPush(
          userId,
          token,
          {
            title: "Connection Report Ready",
            body: pickPushBody(
              COMPATIBILITY_BODIES,
              hashUid(userId, `connection-report-copy:${connectionId}`),
            ),
            data: { screen: "/connection/[id]", connectionId },
          },
          "parseConnectionCompatibility",
        );
      }
      return;
    }

    const now = new Date();
    const localMs = now.getTime() + offset * 60 * 1000;
    const local = new Date(localMs);
    const localHour = local.getUTCHours();

    // Random hour 12,13,14,15,16; random minute 0-59.
    const targetHour =
      12 + (hashUid(`${userId}:${connectionId}:${now.getUTCDate()}`) % 5);
    const targetMin =
      hashUid(`${userId}:${connectionId}:min:${now.getUTCDate()}`) % 60;

    // Build the target moment in user-local terms, then convert back to UTC.
    const localTarget = new Date(local);
    localTarget.setUTCHours(targetHour, targetMin, 0, 0);
    if (localHour >= 17) {
      // Already past the afternoon window — push tomorrow afternoon.
      localTarget.setUTCDate(localTarget.getUTCDate() + 1);
    }
    const sendAfter = new Date(localTarget.getTime() - offset * 60 * 1000);

    // Key: one queued entry per connection per day. A CF retry overwrites
    // the same doc (set is idempotent) instead of creating a second entry.
    const dateKey = now.toISOString().slice(0, 10);
    const pushDocId = `${userId}_${connectionId}_${dateKey}`;

    await enqueueDelayedPush(
      userId,
      sendAfter,
      {
        title: "Connection Report Ready",
        body: pickPushBody(
          COMPATIBILITY_BODIES,
          hashUid(userId, `connection-report-copy:${connectionId}`),
        ),
        data: { screen: "/connection/[id]", connectionId },
      },
      pushDocId,
    );
  },
);

// ─── AI generation (replaces the GenAI extension instances) ─────────────────

/**
 * Generations a user may start per UTC day, per feature, keyed by the `label`
 * runAnchoredGeneration is called with.
 *
 * Unlike chat, these features take their prompt straight from a client write —
 * the rules have to let the owner write `prompt`, because the client builds it —
 * so without a server-side count any account could run unlimited, unfiltered
 * Gemini generations by writing documents under fresh ids. The numbers are
 * generous on purpose: sign-up requests three horoscopes at once and every
 * birth-data edit regenerates them, and a legitimate user should never meet
 * these. They bound abuse; they are not a product quota.
 */
const GENERATION_DAILY_LIMITS: Record<string, number> = {
  generateHoroscope: 20,
  generateNatalBreakdown: 10,
  generateTransitReading: 10,
  generateConnectionReport: 30,
  generateSynastryReading: 30,
};

/**
 * Generations a moderation block covers. createConnection checks the
 * "connections" block, but the report and synastry documents can be written
 * directly, so the generation itself has to check too.
 */
const GENERATION_MODERATED_FEATURE: Record<string, string> = {
  generateConnectionReport: "connections",
  generateSynastryReading: "connections",
};

/** Admins are exempt from generation limits, as they are from chat metering. */
async function isAdminUid(uid: string): Promise<boolean> {
  try {
    const user = await admin.auth().getUser(uid);
    return (user.customClaims ?? {}).admin === true;
  } catch {
    return false;
  }
}

/**
 * Generates into a document that also *triggers* this function, which is the
 * one hazard the extension handled internally and we now own.
 *
 * The guard is a hash of `requestedAt` + `prompt`, claimed in a transaction
 * before the model is called. Every write this function makes carries the hash
 * of the request it is answering and touches neither field, so the write-back
 * re-fires the trigger, matches, and stops.
 *
 * Both fields are load-bearing:
 *   - `prompt`, because `requestSynastryReading` merges a new prompt over the
 *     old document *without* clearing `response`, so "does a response already
 *     exist" would never regenerate.
 *   - `requestedAt`, because `createConnection` deletes `connection.compatibility`
 *     on every call while re-stamping the timestamp. Hashing the prompt alone
 *     meant an unchanged resubmit was skipped as a duplicate — and since the
 *     compatibility field had already been cleared, the connection would sit on
 *     `status.state: "pending"` forever with nothing on the way to fix it.
 *
 * The transaction is what makes it safe under Firestore's at-least-once
 * delivery: two concurrent deliveries of one event race to claim the same hash
 * and exactly one wins. Without it, both would call Gemini.
 *
 * The prompt is read inside the transaction rather than taken from the event,
 * so a burst of writes generates from the document as it actually stands.
 */
async function runAnchoredGeneration(opts: {
  uid: string;
  ref: FirebaseFirestore.DocumentReference;
  schema?: Record<string, unknown>;
  label: string;
  /**
   * Adds generation-time context to the prompt after the request is claimed.
   * The result is sent to the model only — never written back — because the
   * stored prompt is half of the request hash above.
   */
  augmentPrompt?: (prompt: string) => Promise<string>;
  /**
   * Continue from the user's anchor (the default). The anchor profile lists
   * saved connections, so a feature that must not reference them passes false
   * and generates from its own prompt alone.
   */
  anchored?: boolean;
}): Promise<void> {
  const usageRef = db
    .collection("users")
    .doc(opts.uid)
    .collection("generationUsage")
    .doc(new Date().toISOString().slice(0, 10));
  const limit = GENERATION_DAILY_LIMITS[opts.label] ?? 0;
  const moderatedAs = GENERATION_MODERATED_FEATURE[opts.label];
  // Set inside the transaction callback, which narrowing cannot see into.
  let refused = null as string | null;

  const prompt = await db.runTransaction(async (tx) => {
    refused = null;
    const snap = await tx.get(opts.ref);
    if (!snap.exists) return null;

    const data = snap.data() ?? {};
    const current = data.prompt;
    if (typeof current !== "string" || !current) return null;

    const requestedAt = data.requestedAt;
    const stamp =
      requestedAt instanceof Timestamp ? String(requestedAt.toMillis()) : "";
    const requestHash = createHash("sha256")
      .update(`${stamp}\n${current}`)
      .digest("hex");

    if (data.requestHash === requestHash) return null;

    // Limits are checked only for a new request, after the hash guard, so the
    // write-backs that re-fire this trigger never count against them. Every
    // read comes before any write — a transaction rejects the other order.
    const usageSnap = await tx.get(usageRef);
    const used = Number(usageSnap.data()?.[opts.label] ?? 0);
    let blocked = false;
    if (moderatedAs) {
      const modSnap = await tx.get(db.collection("moderation").doc(opts.uid));
      const features = (modSnap.data()?.blockedFeatures ?? []) as string[];
      blocked = features.includes(moderatedAs);
    }

    // The admin lookup is an Auth call, so it is made only once a request
    // would otherwise be refused rather than on every generation.
    if ((blocked || used >= limit) && !(await isAdminUid(opts.uid))) {
      refused = blocked ? "blocked" : "daily limit";
      // Stamping the hash marks this request as answered, so the ERROR write
      // re-fires the trigger, matches, and stops like any other write-back.
      tx.update(opts.ref, {
        requestHash,
        status: {
          state: "ERROR",
          error: blocked
            ? "This feature is not available on your account."
            : "Daily limit reached for this feature. Try again tomorrow.",
        },
      });
      return null;
    }

    // Counted when the request is claimed, not when it succeeds: a failed
    // generation still spent a Gemini call, and the limits are loose enough
    // that a legitimate retry will not run into them.
    tx.set(
      usageRef,
      {
        [opts.label]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    tx.update(opts.ref, {
      requestHash,
      status: { state: "PROCESSING" },
      // Drop the previous answer up front so the client's listener shows the
      // pending state for the whole generation instead of a stale reading.
      response: FieldValue.delete(),
    });
    return current;
  });

  if (refused) {
    console.warn(`[${opts.label}] Refused for ${opts.uid} — ${refused}`);
  }
  if (!prompt) return;

  try {
    const request = {
      prompt: opts.augmentPrompt ? await opts.augmentPrompt(prompt) : prompt,
      schema: opts.schema,
      label: opts.label,
    };
    const { text, interactionId, model } =
      opts.anchored === false
        ? await generateJson(request)
        : await generateWithAnchor(opts.uid, request);
    await opts.ref.update({
      response: text,
      status: { state: "COMPLETED" },
      generatedAt: FieldValue.serverTimestamp(),
      // Kept so a later feature can continue from this specific reading rather
      // than from the anchor — nothing does yet, but it is free to record and
      // impossible to recover afterwards.
      interactionId,
      // Which model produced this. The client logs it, and its absence marks a
      // document as having been written by the legacy GenAI extension instead.
      model,
    });
  } catch (err) {
    // Cap and flatten before this touches a log line. The prompts these
    // functions send carry two people's names and birth data, and an SDK
    // error can quote the request it failed on — Cloud Logging persists, so
    // the message gets a hard length limit and the stack is dropped.
    const reason = describeGenerationError(err);

    console.error(`[${opts.label}] Generation failed — ${reason}`);

    // Mirrors the shape the extension wrote on failure, which is what any
    // already-installed build is prepared to see.
    await opts.ref.update({ status: { state: "ERROR", error: reason } });
  }
}

/**
 * Compatibility report — replaces the `firestore-genai-chatbot` instance that
 * watched `users/{uid}/connections/{id}/report`.
 *
 * `createConnection` writes the prompt here; `parseConnectionCompatibility`
 * (below) picks the `response` back up, parses it onto the connection document
 * and schedules the push. Neither of those changed.
 */
export const generateConnectionReport = onDocumentWritten(
  {
    document: "users/{userId}/connections/{connectionId}/report/{reportId}",
    secrets: [geminiApiKey],
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async (event) => {
    const after = event.data?.after;
    const prompt = after?.data()?.prompt;
    if (!after?.exists || typeof prompt !== "string" || !prompt) return;

    await runAnchoredGeneration({
      uid: event.params.userId,
      ref: after.ref,
      schema: COMPATIBILITY_SCHEMA,
      label: "generateConnectionReport",
    });
  },
);

/**
 * Synastry reading — replaces the `firestore-genai-chatbot-1rrn` instance that
 * watched `users/{uid}/connections/{id}/synastryReading`.
 *
 * The client writes the prompt (`requestSynastryReading`) and reads the
 * response straight off the same document (`subscribeToSynastryReading`), so
 * unlike the report there is no server-side parse step — only
 * `notifySynastryReady`, which is unchanged.
 *
 * No response schema here: see the SYNASTRY_SCHEMA note in interactions.ts.
 */
export const generateSynastryReading = onDocumentWritten(
  {
    document:
      "users/{userId}/connections/{connectionId}/synastryReading/{docId}",
    secrets: [geminiApiKey],
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async (event) => {
    const after = event.data?.after;
    const prompt = after?.data()?.prompt;
    if (!after?.exists || typeof prompt !== "string" || !prompt) return;

    await runAnchoredGeneration({
      uid: event.params.userId,
      ref: after.ref,
      label: "generateSynastryReading",
    });
  },
);

/**
 * Natal chart breakdown — replaces `firestore-natal-chart-chatbot-6ppy`.
 *
 * `requestBreakdown` deletes the document before rewriting it, so this arrives
 * as a create rather than an update. The `requestHash` guard handles both
 * identically: a deleted-and-recreated document has no stored hash, so it is
 * always treated as a new request.
 *
 * Note this is the same document the chart itself lives in — the rewrite
 * replaces the stored chart with `{ prompt, natalChart, requestedAt }`, which
 * is why anchor.ts has to read the chart out of the `natalChart` string.
 */
export const generateNatalBreakdown = onDocumentWritten(
  {
    document: "users/{userId}/natalChart/{docId}",
    secrets: [geminiApiKey],
    timeoutSeconds: 540,
    memory: "256MiB",
  },
  async (event) => {
    const after = event.data?.after;
    const prompt = after?.data()?.prompt;
    if (!after?.exists || typeof prompt !== "string" || !prompt) return;

    await runAnchoredGeneration({
      uid: event.params.userId,
      ref: after.ref,
      schema: NATAL_BREAKDOWN_SCHEMA,
      label: "generateNatalBreakdown",
    });
  },
);

/**
 * Daily horoscope — replaces `horoscope-chatbot-b6wc`.
 *
 * One document per day at `users/{uid}/horoscope/{YYYY-MM-DD}`. No response
 * schema; see the HOROSCOPE_SCHEMA note in interactions.ts.
 *
 * Deliberately **not** anchored: the anchor profile names the user's saved
 * connections and their compatibility highlights, and the daily horoscope is
 * meant to stay about the user alone. The prompt already carries the full
 * chart, so the only thing the anchor added besides connections was pronouns —
 * appended here instead, since the client template has no slot for them.
 *
 * Each day's quote gets a rotating topic and style, and the quotes from the
 * surrounding days' horoscopes go out as a do-not-repeat list — see
 * quote-history.ts. A failed history lookup generates without the list rather
 * than failing the reading.
 */
export const generateHoroscope = onDocumentWritten(
  {
    document: "users/{userId}/horoscope/{dateId}",
    secrets: [geminiApiKey],
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async (event) => {
    const after = event.data?.after;
    const prompt = after?.data()?.prompt;
    if (!after?.exists || typeof prompt !== "string" || !prompt) return;

    const { userId, dateId } = event.params;
    await runAnchoredGeneration({
      uid: userId,
      ref: after.ref,
      label: "generateHoroscope",
      anchored: false,
      augmentPrompt: async (prompt) => {
        const userSnap = await db.collection("users").doc(userId).get();
        const pronouns = String(userSnap.data()?.pronouns ?? "").trim();
        const directed = withQuoteDirection(
          `${prompt}\n\nUser pronouns: ${pronouns || "they/them"}.`,
          hashUid(userId, "quote-direction"),
          dateId,
        );
        try {
          return withQuotesToAvoid(
            directed,
            await recentHoroscopeQuotes(userId, dateId),
          );
        } catch (err) {
          const reason = err instanceof Error ? err.name : "unknown";
          console.warn(`[generateHoroscope] quote history skipped — ${reason}`);
          return directed;
        }
      },
    });
  },
);

/**
 * Weekly transits — replaces `firestore-transits-chatbot-cgl7`.
 *
 * Both `fetchTransitReading` and `subscribeToTransitReading` refuse to surface
 * a reading until `status.state` lowercases to "complete" or "completed", so
 * the "COMPLETED" written by runAnchoredGeneration is load-bearing here in a
 * way it is not for the other features. Don't change that string without
 * changing `src/services/transit-reading.service.ts` with it.
 */
export const generateTransitReading = onDocumentWritten(
  {
    document: "users/{userId}/transits/{dateId}",
    secrets: [geminiApiKey],
    timeoutSeconds: 540,
    memory: "256MiB",
  },
  async (event) => {
    const after = event.data?.after;
    const prompt = after?.data()?.prompt;
    if (!after?.exists || typeof prompt !== "string" || !prompt) return;

    await runAnchoredGeneration({
      uid: event.params.userId,
      ref: after.ref,
      schema: TRANSITS_SCHEMA,
      label: "generateTransitReading",
    });
  },
);

/**
 * AI chat — replaces `firestore-genai-chatbot-update-5i5h`.
 *
 * Both personas ride this one collection; the mode is a field on the message,
 * not a separate path. All of the replay and continuity reasoning lives in
 * chat-generation.ts.
 *
 * `sendChatMessage` is the only writer of a non-empty `prompt` — the Firestore
 * rules allow a client `create` only when `prompt == ''` and deny `update`
 * outright, because a non-empty prompt is what starts a billable generation.
 * This trigger therefore never fires for anything the client wrote directly.
 */
export const generateChatMessage = onDocumentWritten(
  {
    document: "users/{userId}/updayedChat/{messageId}",
    secrets: [geminiApiKey],
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async (event) => {
    const after = event.data?.after;
    const prompt = after?.data()?.prompt;
    if (!after?.exists || typeof prompt !== "string" || !prompt) return;

    await runChatGeneration(event.params.userId, after.ref);
  },
);

// ─── weeklyCleanup ───────────────────────────────────────────────────────────

/**
 * Runs every Sunday at 06:00 UTC (before any user's local Sunday-morning
 * push window opens). Prunes documents older than 7 days from:
 *   - users/{uid}/cards/{YYYY-MM-DD}
 *   - users/{uid}/horoscope/{YYYY-MM-DD}
 *   - users/{uid}/transits/{YYYY-MM-DD}
 *
 * All three subcollections use a YYYY-MM-DD document ID. YYYY-MM-DD strings
 * sort lexicographically in the same order as calendar dates, so a simple
 * string comparison against the cutoff date is sufficient — no timestamp
 * fields or collectionGroup index queries needed.
 *
 * Synastry readings, connection reports, and natal chart docs are NOT touched
 * — they are birth-chart-based and never stale.
 */
export const weeklyCleanup = onSchedule("every sunday 06:00", async () => {
  // Cutoff: 7 days before today, formatted as YYYY-MM-DD.
  // Any doc whose ID is strictly less than this string is eligible for deletion.
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const cutoffDateId = [
    cutoff.getUTCFullYear(),
    String(cutoff.getUTCMonth() + 1).padStart(2, "0"),
    String(cutoff.getUTCDate()).padStart(2, "0"),
  ].join("-");

  console.info(`[weeklyCleanup] cutoff date: ${cutoffDateId}`);

  // List all user document references (no data reads — paths only).
  const userRefs = await db.collection("users").listDocuments();

  let cardsDeleted = 0;
  let horoscopesDeleted = 0;
  let transitsDeleted = 0;

  const allToDelete: FirebaseFirestore.DocumentReference[] = [];

  // Process users in chunks of 25 to avoid saturating Firestore quota.
  // Each user's work is wrapped in try/catch so a single transient error
  // does not abort collection for all other users.
  const CONCURRENCY_LIMIT = 25;
  let failedUsers = 0;

  for (let i = 0; i < userRefs.length; i += CONCURRENCY_LIMIT) {
    const chunk = userRefs.slice(i, i + CONCURRENCY_LIMIT);
    await Promise.all(
      chunk.map(async (userRef) => {
        try {
          const [cardRefs, horoRefs, transitRefs] = await Promise.all([
            userRef.collection("cards").listDocuments(),
            userRef.collection("horoscope").listDocuments(),
            userRef.collection("transits").listDocuments(),
          ]);

          const oldCards = cardRefs.filter((r) => r.id < cutoffDateId);
          const oldHoroscopes = horoRefs.filter((r) => r.id < cutoffDateId);
          const oldTransits = transitRefs.filter((r) => r.id < cutoffDateId);

          cardsDeleted += oldCards.length;
          horoscopesDeleted += oldHoroscopes.length;
          transitsDeleted += oldTransits.length;

          allToDelete.push(...oldCards, ...oldHoroscopes, ...oldTransits);
        } catch (err) {
          failedUsers++;
          console.error(
            `[weeklyCleanup] Failed to list docs for user ${userRef.id}:`,
            err,
          );
        }
      }),
    );
  }

  // Batch-delete in chunks of 500 (Firestore write-batch limit).
  const BATCH_SIZE = 500;
  for (let i = 0; i < allToDelete.length; i += BATCH_SIZE) {
    const batch = db.batch();
    allToDelete.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  console.info(
    `[weeklyCleanup] queued ${cardsDeleted} cards, ` +
      `${horoscopesDeleted} horoscopes, ${transitsDeleted} transits for deletion` +
      (failedUsers > 0 ? `; ${failedUsers} user(s) failed to list` : ""),
  );
});

// ─── Shared helpers for aggregatePerfLogs ────────────────────────────────────

function formatDateId(d: Date): string {
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Returns the p-th percentile of a pre-sorted array of numbers.
 * Uses nearest-rank method. Returns 0 for empty arrays.
 * Exported for unit testing.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ─── aggregatePerfLogs ───────────────────────────────────────────────────────

/**
 * Runs every day at 02:00 UTC.
 *
 * For each screen in performanceLogs/:
 *   1. Reads yesterday's raw events (timestamp in [start-of-yesterday, start-of-today))
 *   2. Computes p50/p95 for screen_load and each ai_call operation name
 *   3. Counts errors
 *   4. Writes performanceLogs/{slug}/daily/{YYYY-MM-DD}
 *   5. Deletes raw events older than 7 days
 *   6. Deletes daily docs older than 90 days
 *
 * Processes screens in concurrent chunks of 10; wraps each in try/catch so
 * one bad screen does not abort the rest.
 */
export const aggregatePerfLogs = onSchedule("every day 02:00", async () => {
  const now = new Date();

  // Yesterday for the daily summary key
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayId = formatDateId(yesterday);

  // Time window: [start of yesterday, start of today)
  const startOfYesterday = new Date(
    Date.UTC(
      yesterday.getUTCFullYear(),
      yesterday.getUTCMonth(),
      yesterday.getUTCDate(),
    ),
  );
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  // Raw event deletion cutoff (7 days ago)
  const rawCutoff = new Date(now);
  rawCutoff.setUTCDate(rawCutoff.getUTCDate() - 7);

  // Daily summary deletion cutoff (90 days ago as YYYY-MM-DD string)
  const dailyCutoff = new Date(now);
  dailyCutoff.setUTCDate(dailyCutoff.getUTCDate() - 90);
  const dailyCutoffId = formatDateId(dailyCutoff);

  const screenRefs = await db.collection("performanceLogs").listDocuments();
  if (screenRefs.length === 0) {
    console.info("[aggregatePerfLogs] No screen docs — nothing to aggregate");
    return;
  }

  let totalAggregated = 0;
  let failedScreens = 0;

  const CONCURRENCY = 10;
  for (let i = 0; i < screenRefs.length; i += CONCURRENCY) {
    const chunk = screenRefs.slice(i, i + CONCURRENCY);

    await Promise.all(
      chunk.map(async (screenRef) => {
        const slug = screenRef.id;
        try {
          // ── 1. Query yesterday's events ──────────────────────────────────
          const eventsSnap = await screenRef
            .collection("events")
            .where("timestamp", ">=", Timestamp.fromDate(startOfYesterday))
            .where("timestamp", "<", Timestamp.fromDate(startOfToday))
            .get();

          if (!eventsSnap.empty) {
            const events = eventsSnap.docs.map((d) => d.data());

            // ── 2. Compute screen_load stats ─────────────────────────────
            const loadDurations = events
              .filter(
                (e) =>
                  e.metricType === "screen_load" &&
                  typeof e.durationMs === "number",
              )
              .map((e) => e.durationMs as number)
              .sort((a, b) => a - b);

            const screenLoad =
              loadDurations.length > 0
                ? {
                    count: loadDurations.length,
                    sumMs: loadDurations.reduce((s, v) => s + v, 0),
                    minMs: loadDurations[0],
                    maxMs: loadDurations[loadDurations.length - 1],
                    p50Ms: percentile(loadDurations, 50),
                    p95Ms: percentile(loadDurations, 95),
                  }
                : null;

            // ── 3. Compute per-operation ai_call stats ───────────────────
            const opEvents = events.filter(
              (e) => e.metricType === "ai_call" && e.operationName,
            );
            const opNames = [
              ...new Set(opEvents.map((e) => e.operationName as string)),
            ];

            const operations: Record<
              string,
              {
                count: number;
                sumMs: number;
                p50Ms: number;
                p95Ms: number;
              }
            > = {};

            for (const opName of opNames) {
              const durations = opEvents
                .filter(
                  (e) =>
                    e.operationName === opName &&
                    typeof e.durationMs === "number",
                )
                .map((e) => e.durationMs as number)
                .sort((a, b) => a - b);
              operations[opName] = {
                count: durations.length,
                sumMs: durations.reduce((s, v) => s + v, 0),
                p50Ms: percentile(durations, 50),
                p95Ms: percentile(durations, 95),
              };
            }

            // ── 4. Count errors ──────────────────────────────────────────
            const errorCount = events.filter(
              (e) => e.metricType === "error",
            ).length;

            // ── 5. Write daily summary ───────────────────────────────────
            await screenRef
              .collection("daily")
              .doc(yesterdayId)
              .set({
                screen: eventsSnap.docs[0].data().screen ?? slug,
                date: yesterdayId,
                ...(screenLoad ? { screenLoad } : {}),
                operations,
                errorCount,
                totalEvents: events.length,
                updatedAt: FieldValue.serverTimestamp(),
              });

            totalAggregated += events.length;
          }

          // ── 6. Delete raw events older than 7 days ───────────────────
          const oldEventsSnap = await screenRef
            .collection("events")
            .where("timestamp", "<", Timestamp.fromDate(rawCutoff))
            .limit(500)
            .get();

          if (!oldEventsSnap.empty) {
            const BATCH_SIZE = 500;
            for (let j = 0; j < oldEventsSnap.docs.length; j += BATCH_SIZE) {
              const batch = db.batch();
              oldEventsSnap.docs
                .slice(j, j + BATCH_SIZE)
                .forEach((d) => batch.delete(d.ref));
              await batch.commit();
            }
          }

          // ── 7. Delete daily docs older than 90 days ──────────────────
          const dailyRefs = await screenRef.collection("daily").listDocuments();
          const oldDaily = dailyRefs.filter((r) => r.id < dailyCutoffId);
          if (oldDaily.length > 0) {
            const batch = db.batch();
            oldDaily.forEach((r) => batch.delete(r));
            await batch.commit();
          }
        } catch (err) {
          failedScreens++;
          console.error(
            `[aggregatePerfLogs] Failed for screen "${slug}":`,
            err,
          );
        }
      }),
    );
  }

  console.info(
    `[aggregatePerfLogs] done — ${totalAggregated} events aggregated` +
      (failedScreens > 0 ? `, ${failedScreens} screen(s) failed` : ""),
  );
});

// ─── Prompt testing ──────────────────────────────────────────────────────────

/**
 * An admin-only scratchpad for the generation stack.
 *
 * This exists because there was no way to try a prompt change without shipping
 * it: every AI feature builds its prompt on the client, writes it to Firestore
 * and waits for a trigger, so "does this wording work?" meant a rebuild, a real
 * user document, and a push notification. This runs the same `generateJson`
 * path the live features use, against a context and prompt typed into the
 * dashboard.
 *
 * Four things it deliberately does not do:
 *
 * 1. **Write to Firestore.** The result is returned and forgotten — no document
 *    to clean up, no trigger to accidentally fire, no push to a real person.
 * 2. **Touch a user's anchor.** A conversation here chains only to its own
 *    prior turns (see `previousInteractionId` below). Testing a prompt must not
 *    alter what the model remembers about someone real.
 * 3. **Ask for JSON.** Every turn runs `plainText`, because this is a
 *    conversation. Asking for `application/json` here would make the model wrap
 *    a conversational reply in a JSON string, which is the same reason chat
 *    itself runs plain.
 * 4. **Use the production token ceiling.** A runaway here is a bill with nobody
 *    waiting on the other end, so the cap sits an order of magnitude below the
 *    32k the real features allow.
 *
 * Retention applies as it does everywhere else: `generateJson` sets
 * `store: true` (the Interactions API refuses `previous_interaction_id`
 * without it), so anything typed here is retained by Google for 55 days. Test
 * with invented birth data, not a real user's.
 */

/** See point 4 above — a circuit breaker, not a size estimate. */
const PROMPT_TEST_MAX_TOKENS = 4096;

function requireAdminCaller(request: {
  auth?: { uid: string; token: Record<string, unknown> };
}): string {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  if (request.auth.token?.admin !== true) {
    throw new HttpsError("permission-denied", "Admin privileges required.");
  }
  return request.auth.uid;
}

const RunPromptTestSchema = z.object({
  prompt: z.string().min(1).max(100_000),
  /**
   * Sent verbatim as `system_instruction`. An empty string is a real choice —
   * "run with no persona at all" — and is distinct from omitting the field,
   * which lets generateJson fall back to DELALUNA_CONTEXT.
   */
  systemInstruction: z.string().max(100_000).optional(),
  /**
   * The previous turn's interaction id, which is what makes this a
   * conversation rather than a series of unrelated one-shots. The client sends
   * back whatever the last successful turn returned; the server does not track
   * sessions, so a reload with a stale id simply continues from wherever that
   * id points, and omitting it starts fresh.
   */
  previousInteractionId: z.string().max(500).optional(),
});

export const runPromptTest = onCall(
  { secrets: [geminiApiKey], invoker: "public", timeoutSeconds: 300 },
  async (request) => {
    requireAdminCaller(request);
    const input = parseInput(RunPromptTestSchema, request.data);

    const started = Date.now();
    try {
      const result = await generateJson({
        prompt: input.prompt,
        systemInstruction: input.systemInstruction,
        previousInteractionId: input.previousInteractionId,
        plainText: true,
        maxOutputTokens: PROMPT_TEST_MAX_TOKENS,
        // PROMPT_TEST_MAX_TOKENS is a hard cutoff that counts thought tokens,
        // so the generateJson default would eat into the 4096 an admin's test
        // reply has to fit in and truncate it. Cheap and fast is the point here.
        thinkingLevel: "low" as const,
        label: "promptTest",
      });

      return {
        ok: true as const,
        text: result.text,
        model: result.model,
        interactionId: result.interactionId,
        elapsedMs: Date.now() - started,
      };
    } catch (err) {
      // Returned rather than thrown. Every interesting failure here — a
      // truncated generation, a model that stopped early, a dead interaction id
      // — is a *result* the admin needs to read, and an HttpsError would reach
      // the browser as a generic "internal" with the detail stripped.
      const message = err instanceof Error ? err.message : String(err);
      console.info(
        `[promptTest] failed in ${Date.now() - started}ms: ${message}`,
      );
      return {
        ok: false as const,
        error: message,
        elapsedMs: Date.now() - started,
      };
    }
  },
);
