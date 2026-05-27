import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as nodemailer from 'nodemailer';
import { randomInt } from 'crypto';
import { z, ZodError, ZodType } from 'zod';

// ─── Secrets (set via: firebase functions:secrets:set EMAIL_USER) ─────────────
const emailUser = defineSecret('EMAIL_USER');
const emailPass = defineSecret('EMAIL_PASS');

// Comma-separated list of admin email addresses. Held server-side only so
// rotation does not require shipping a new mobile build. Matched
// case-insensitively against the verified email on the caller's auth token.
const adminEmails = defineSecret('ADMIN_EMAILS');

// ─── Init ─────────────────────────────────────────────────────────────────────
admin.initializeApp();
const db = admin.firestore();

const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
console.log(`[functions] Running in ${isEmulator ? 'EMULATOR (dev)' : 'PRODUCTION'} mode`);

// ─── Helpers ─────────────────────────────────────────────────────────────────

// 6-character alphanumeric OTP. Uses an ambiguity-free alphabet (no
// 0/O/1/I/L) so users transcribing from an email don't fat-finger a code,
// and crypto.randomInt for a uniform distribution — Math.random() is not
// suitable for security-sensitive randomness.
const OTP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars
function generateOtp(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += OTP_ALPHABET[randomInt(OTP_ALPHABET.length)];
  }
  return out;
}

function getOtpDocRef(uid: string) {
  return db.collection('emailVerification').doc(uid);
}

function buildTransporter(user: string, pass: string) {
  return nodemailer.createTransport({
    service: 'gmail',
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
      const path = issue.path.join('.') || '<root>';
      throw new HttpsError(
        'invalid-argument',
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
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || 'unknown';
}

// Cap user-supplied LLM prompts and collapse control chars / whitespace.
// Caps at 32 KB - well under any model's context window and large enough
// for the compatibility-prompt template (5.7 KB) plus two ~8 KB natal-chart
// JSON payloads. Replaces ASCII control chars with spaces and folds
// whitespace runs so we don't slip terminator sequences through to the
// Handlebars-substituted prompt template.
function sanitizePrompt(input: string | undefined, maxLen = 32000): string {
  if (!input) return '';
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, maxLen)
    .trim();
}


// ─── Schemas ─────────────────────────────────────────────────────────────────

// Accept the same alphabet generateOtp emits (case-insensitive — the verifier
// uppercases before comparing). The literal class is the ambiguity-free set;
// keeping it permissive on the regex side guards against future alphabet
// tweaks without forcing a coordinated client deploy.
const VerifyCodeSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9]{6}$/, 'Code must be 6 letters or digits.'),
});

const DeleteConnectionSchema = z.object({
  userId: z.string().min(1).max(128),
  connectionId: z.string().min(1).max(200).regex(/^[A-Za-z0-9_\-]+$/, 'Invalid connectionId.'),
});

const PersonSchema = z.object({
  'First Name': z.string().max(80).optional(),
  'Last Name': z.string().max(80).optional(),
  'Pronouns': z.string().max(40).optional(),
  'Sun Sign': z.string().max(40).optional(),
  'Moon Sign': z.string().max(40).optional(),
  'Rising Sign': z.string().max(40).optional(),
  'Birthday': z.string().max(40).optional(),
  'Time of Birth': z.string().max(40).optional(),
  'Place of Birth': z.string().max(200).optional(),
  birthLat: z.number().min(-90).max(90).nullable().optional(),
  birthLon: z.number().min(-180).max(180).nullable().optional(),
  birthTimezone: z.number().min(-14).max(14).nullable().optional(),
  isBirthTimeUnknown: z.boolean().optional(),
  isPlaceOfBirthUnknown: z.boolean().optional(),
}).passthrough();

const CreateConnectionSchema = z.object({
  userId: z.string().min(1).max(128),
  isMe: z.boolean().optional().default(false),
  relationshipType: z.string().min(1).max(60),
  firstPerson: PersonSchema,
  secondPerson: PersonSchema,
  prompt: z.string().max(32000).optional(),
  birthDetailsChangeCount: z.number().int().nonnegative().optional(),
});

// ─── sendVerificationCode ─────────────────────────────────────────────────────

export const sendVerificationCode = onCall(
  { secrets: [emailUser, emailPass], invoker: 'public' },
  
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }

    
    
    const uid = request.auth.uid;
    const email = request.auth.token.email;
    console.log("Auth: ", request.auth);

    if (!email) {
      throw new HttpsError('invalid-argument', 'No email on account.');
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
            'resource-exhausted',
            `Please wait ${Math.ceil(60 - secondsAgo)} seconds before requesting a new code.`
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

    const transporter = buildTransporter(
      emailUser.value(),
      emailPass.value()
    );

    await transporter.sendMail({
      from: `"Delaluna Answers" <${emailUser.value()}>`,
      to: email,
      subject: 'Your Delaluna verification code',
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
  }
);

// ─── verifyCode ───────────────────────────────────────────────────────────────

export const verifyCode = onCall({ invoker: 'public' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const uid = request.auth.uid;
  const { code } = parseInput(VerifyCodeSchema, request.data);

  const otpRef = getOtpDocRef(uid);
  const snap = await otpRef.get();

  if (!snap.exists) {
    throw new HttpsError('not-found', 'No verification code found. Please request a new one.');
  }

  const data = snap.data()!;
  const expiresAt: Timestamp = data.expiresAt;
  const attempts: number = data.attempts ?? 0;

  if (attempts >= 5) {
    await otpRef.delete();
    throw new HttpsError('resource-exhausted', 'Too many attempts. Please request a new code.');
  }

  if (expiresAt.toMillis() < Date.now()) {
    await otpRef.delete();
    throw new HttpsError('deadline-exceeded', 'Code has expired. Please request a new one.');
  }

  if (data.code !== code.toUpperCase()) {
    await otpRef.update({ attempts: FieldValue.increment(1) });
    const remaining = 4 - attempts;
    throw new HttpsError(
      'invalid-argument',
      remaining > 0
        ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Incorrect code.'
    );
  }

  // Code is correct — mark email as verified
  await admin.auth().updateUser(uid, { emailVerified: true });
  await db.collection('users').doc(uid).update({ isEmailVerified: true });
  await otpRef.delete();

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
  { secrets: [adminEmails], invoker: 'public' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }

    const uid = request.auth.uid;
    const email = (request.auth.token.email ?? '').toLowerCase();
    const emailVerified = request.auth.token.email_verified === true;

    const allowed = adminEmails
      .value()
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const shouldBeAdmin = emailVerified && !!email && allowed.includes(email);

    const userRecord = await admin.auth().getUser(uid);
    const existingClaims = (userRecord.customClaims ?? {}) as Record<string, unknown>;
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
      .collection('users')
      .doc(uid)
      .set({ isAdmin: shouldBeAdmin }, { merge: true });

    console.log(
      `[syncAdminClaim] uid=${uid} email=${email} -> admin=${shouldBeAdmin}`,
    );

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
export const revokeMyRefreshTokens = onCall({ invoker: 'public' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  await admin.auth().revokeRefreshTokens(request.auth.uid);
  return { revoked: true };
});

// ─── sendMorningReminder ──────────────────────────────────────────────────────

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_CHUNK_SIZE = 100;

interface ExpoPushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  channelId?: string;
  data?: Record<string, string>;
  priority?: 'default' | 'normal' | 'high';
  _contentAvailable?: boolean;
}

/**
 * Runs every day at 8:00 AM UTC.
 * Queries all users with a saved Expo push token and sends a morning reminder.
 */
/**
 * Runs every day at midnight UTC.
 * Deletes all chat messages older than 24 hours across all users.
 */
export const clearDailyChatHistory = onSchedule('every day 00:00', async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);

  const snap = await db.collectionGroup('updayedChat')
    .where('createTime', '<', cutoff)
    .get();

  if (snap.empty) return;

  const BATCH_SIZE = 500;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    snap.docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

});

// Silent midnight rollover hour in user local time. The client treats this as
// a hint to regenerate today's horoscope so a fresh reading is ready by morning.
// Best-effort: silent pushes are throttled by iOS and won't fire if the app is
// force-killed.
const ROLLOVER_PUSH_LOCAL_HOUR = 0;

// Each user is assigned a stable per-UID hour in [HOUR_BASE, HOUR_BASE + HOUR_SPAN)
// so we don't blast every user at exactly 8:00 AM (Expo throttles, and we'd also
// burst Google AI generation if the rollover/horoscope generation kicks in).
const HOUR_BASE = 6;   // earliest local hour
const HOUR_SPAN = 5;   // 6,7,8,9,10
const SUNDAY = 0;      // Date.getUTCDay()

// Premium entitlement id used by RevenueCat (must match the entitlement
// configured in the RC dashboard and used by useRevenueCat().isPro).
const PREMIUM_ENTITLEMENT_ID = 'Delaluna Answers Pro';

// Skip chat-reply pushes if the user was active in the last 30s — they're
// almost certainly looking at the chat screen and don't need a notification.
const CHAT_FOREGROUND_GRACE_MS = 30_000;

/**
 * Returns the user's current local hour (0-23) given a UTC offset in minutes.
 * Returns null if the offset is missing or invalid.
 */
function localHourFromOffset(nowUtc: Date, offsetMinutes: unknown): number | null {
  if (typeof offsetMinutes !== 'number' || !Number.isFinite(offsetMinutes)) return null;
  const localMinutes = nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes() + offsetMinutes;
  const wrapped = ((localMinutes % 1440) + 1440) % 1440;
  return Math.floor(wrapped / 60);
}

/**
 * Returns the user's current local day-of-week (0=Sunday … 6=Saturday) given
 * a UTC offset in minutes. Returns null if the offset is missing or invalid.
 */
function localDayOfWeek(nowUtc: Date, offsetMinutes: unknown): number | null {
  if (typeof offsetMinutes !== 'number' || !Number.isFinite(offsetMinutes)) return null;
  const localMs = nowUtc.getTime() + offsetMinutes * 60 * 1000;
  return new Date(localMs).getUTCDay();
}

/**
 * Stable FNV-1a hash of `uid + salt` used to spread per-user push timing
 * across the HOUR_SPAN window. Same uid always maps to the same hour, so
 * a given user gets their daily horoscope at the same local time every day.
 */
function hashUid(uid: string, salt = ''): number {
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
 * Server-side premium check. Reads the RevenueCat extension's purchaser-info
 * mirror and returns true if the user has the active "Delaluna Answers Pro"
 * entitlement. Returns false on any error so we never push premium content
 * to non-premium users by mistake.
 */
async function isUserPremium(uid: string): Promise<boolean> {
  try {
    const snap = await db.doc(`subscriptions/purchaser-info/customers/${uid}`).get();
    const data = snap.data();
    const ent = data?.subscriber?.entitlements?.[PREMIUM_ENTITLEMENT_ID]
      ?? data?.entitlements?.[PREMIUM_ENTITLEMENT_ID];
    if (!ent) return false;
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
 */
async function enqueueDelayedPush(
  userId: string,
  sendAfter: Date,
  payload: PushPayload,
): Promise<void> {
  await db.collection('scheduledPushes').add({
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
  const due = await db.collection('scheduledPushes')
    .where('sendAfter', '<=', Timestamp.fromDate(now))
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

    const userSnap = await db.collection('users').doc(userId).get();
    const token = userSnap.data()?.expoPushToken as string | undefined;
    if (!token) continue;

    messages.push({
      to: token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      channelId: 'default',
      data: payload.data ?? {},
      priority: 'high',
      _contentAvailable: true,
    });
  }

  for (let i = 0; i < messages.length; i += PUSH_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + PUSH_CHUNK_SIZE);
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(chunk),
    });
  }

  // Always delete drained queue docs (even if push failed) so we don't loop
  // forever on a permanently-bad token.
  const BATCH = 500;
  for (let i = 0; i < docsToDelete.length; i += BATCH) {
    const batch = db.batch();
    docsToDelete.slice(i, i + BATCH).forEach(r => batch.delete(r));
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
 *  - Sunday at local connections hour (6-10 AM): weekly connection updates,
 *    Premium users with at least one connection only.
 *
 * Also drains the scheduledPushes queue (used by the connection-report flow
 * to randomize delivery into the afternoon).
 */
export const dailyHoroscopeNotifications = onSchedule('every 1 hours', async () => {
  const now = new Date();
  const messages: ExpoPushMessage[] = [];

  const snap = await db.collection('users')
    .where('expoPushToken', '!=', null)
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

    // Silent rollover at local midnight (regardless of weekday).
    if (localHour === ROLLOVER_PUSH_LOCAL_HOUR) {
      messages.push({
        to: token,
        sound: 'default',
        title: '',
        body: '',
        channelId: 'default',
        data: { action: 'rollover-horoscope' },
        priority: 'high',
        _contentAvailable: true,
      });
      continue;
    }

    const horoHour = jitterHour(uid, 'horoscope');
    const txHour = jitterHour(uid, 'transits');
    const cxHour = jitterHour(uid, 'connections');

    if (localHour === horoHour) {
      messages.push({
        to: token,
        sound: 'default',
        title: '🌙 Your Daily Reading',
        body: 'Your horoscope and cards for today are ready.',
        channelId: 'default',
        data: { screen: '/(main)' },
        priority: 'high',
        _contentAvailable: true,
      });
    }

    if (localDay === SUNDAY && localHour === txHour) {
      messages.push({
        to: token,
        sound: 'default',
        title: '✨ This Week in the Stars',
        body: 'Your fresh weekly transits just dropped. Tap to see what the week has in store.',
        channelId: 'default',
        data: { screen: '/(main)/transits' },
        priority: 'high',
        _contentAvailable: true,
      });
    }

    if (localDay === SUNDAY && localHour === cxHour) {
      // Premium-gated and only relevant if the user actually has connections.
      const [premium, cxSnap] = await Promise.all([
        isUserPremium(uid),
        userDoc.ref.collection('connections').limit(1).get(),
      ]);
      if (premium && !cxSnap.empty) {
        messages.push({
          to: token,
          sound: 'default',
          title: '💞 Weekly Connection Update',
          body: 'New transits for your connections are ready. See what shifted this week.',
          channelId: 'default',
          data: { screen: '/(main)/connections' },
          priority: 'high',
          _contentAvailable: true,
        });
      }
    }
  }

  // Send the timing-based pushes.
  for (let i = 0; i < messages.length; i += PUSH_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + PUSH_CHUNK_SIZE);
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(chunk),
    });
  }

  // Drain any due delayed pushes (connection-report afternoon randomization, etc).
  const drained = await drainScheduledPushes(now);

  console.info(
    `[dailyHoroscopeNotifications] sent ${messages.length} timed + ${drained} drained pushes`,
  );
});

// ─── deleteConnection ─────────────────────────────────────────────────────────

export const deleteConnection = onCall({ invoker: 'public' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const { userId, connectionId } = parseInput(DeleteConnectionSchema, request.data);

  // Only allow users to delete their own connections
  if (request.auth.uid !== userId) {
    throw new HttpsError('permission-denied', 'You can only delete your own connections.');
  }

  const connectionRef = db
    .collection('users')
    .doc(userId)
    .collection('connections')
    .doc(connectionId);

  const snap = await connectionRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Connection not found.');
  }

  await connectionRef.delete();

  return { deleted: true };
});

// ─── createConnection ─────────────────────────────────────────────────────────

export const createConnection = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const {
    userId,
    isMe,
    relationshipType,
    firstPerson,
    secondPerson,
    prompt: clientPrompt,
    birthDetailsChangeCount,
  } = parseInput(CreateConnectionSchema, request.data);

  // Only allow users to create connections under their own user doc
  if (request.auth.uid !== userId) {
    throw new HttpsError('permission-denied', 'You can only create your own connections.');
  }

  type ValidatedPerson = z.infer<typeof PersonSchema>;
  const mapPerson = (p: ValidatedPerson) => ({
    firstName: p['First Name'] ?? '',
    lastName: p['Last Name'] ?? '',
    pronouns: p['Pronouns'] ?? '',
    sun: p['Sun Sign'] ?? '',
    moon: p['Moon Sign'] ?? '',
    rising: p['Rising Sign'] ?? '',
    birthday: p['Birthday'] ?? '',
    timeOfBirth: p['Time of Birth'] ?? '',
    placeOfBirth: p['Place of Birth'] ?? '',
    birthLat: typeof p.birthLat === 'number' ? p.birthLat : null,
    birthLon: typeof p.birthLon === 'number' ? p.birthLon : null,
    birthTimezone: typeof p.birthTimezone === 'number' ? p.birthTimezone : null,
    isBirthTimeUnknown: !!p.isBirthTimeUnknown,
    isPlaceOfBirthUnknown: !!p.isPlaceOfBirthUnknown,
  });

  let mappedFirst = mapPerson(firstPerson);

  if (isMe) {
    const chartSnap = await db
      .collection('users').doc(userId)
      .collection('natalChart').doc('details')
      .get();
    if (chartSnap.exists) {
      const chart = chartSnap.data()!;
      const sunPlanet = (chart.planets as any[])?.find((p: any) => p.name === 'Sun');
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
    .collection('users')
    .doc(userId)
    .collection('connections')
    .doc(connectionId);

  const reportRef = connectionRef.collection('report').doc('details');

  const existingSnap = await connectionRef.get();
  const isNew = !existingSnap.exists;

  await connectionRef.set(
    {
      connectionId,
      isMe: !!isMe,
      relationshipType,
      firstPerson: mappedFirst,
      secondPerson: mappedSecond,
      status: { state: 'pending' },
      birthDetailsChangeCount:
        typeof birthDetailsChangeCount === 'number'
          ? birthDetailsChangeCount
          : existingSnap.data()?.birthDetailsChangeCount ?? 0,
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

  return { connectionId };
});

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
    sound: 'default' as const,
    title: payload.title,
    body: payload.body,
    channelId: 'default',
    data: payload.data ?? {},
    priority: 'high' as const,
    _contentAvailable: true,
  };

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const json = await res.json().catch(() => null);

    // Expo returns 200 even when individual messages have errors — check the data array
    const ticket = json?.data?.[0] ?? json?.data;
    if (ticket?.status === 'error') {
      console.error(`[${context}] Push ticket error for user ${userId}:`, ticket);
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
  'users/{userId}/natalChart/details',
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

    const userSnap = await db.collection('users').doc(userId).get();
    const token = userSnap.data()?.expoPushToken as string | undefined;
    if (!token) {
      console.info(`[notifyBreakdownReady] Skip — user ${userId} has no expoPushToken`);
      return;
    }

    await sendExpoPush(userId, token, {
      title: 'Your Birth Chart is Ready',
      body: 'Your natal chart breakdown is complete. Tap to explore your cosmic blueprint.',
      data: { screen: '/(home)/birth-chart-view' },
    }, 'notifyBreakdownReady');
  }
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
  'users/{userId}/updayedChat/{messageId}',
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const userId = event.params.userId;

    if (!after?.response) return;
    if (before?.response === after.response) return;

    const userSnap = await db.collection('users').doc(userId).get();
    const userData = userSnap.data();
    const token = userData?.expoPushToken as string | undefined;
    if (!token) return;

    const lastActiveAt = userData?.lastActiveAt as Timestamp | undefined;
    if (lastActiveAt && Date.now() - lastActiveAt.toMillis() < CHAT_FOREGROUND_GRACE_MS) {
      console.info(`[notifyChatReply] Skip — user ${userId} foregrounded`);
      return;
    }

    await sendExpoPush(userId, token, {
      title: 'New Message',
      body: 'Your cosmic advisor has replied. Tap to read.',
      data: { screen: '/(main)/chat' },
    }, 'notifyChatReply');
  }
);

// ─── notifySynastryReady ─────────────────────────────────────────────────────

/**
 * Push when the synastry reading extension writes back its `response` field.
 * Synastry is birthchart-based and never regenerates on the weekly schedule —
 * this fires once per (re)generation only.
 */
export const notifySynastryReady = onDocumentUpdated(
  'users/{userId}/connections/{connectionId}/synastryReading/{docId}',
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const { userId, connectionId } = event.params;

    if (!after?.response) return;
    if (before?.response === after.response) return;

    const userSnap = await db.collection('users').doc(userId).get();
    const token = userSnap.data()?.expoPushToken as string | undefined;
    if (!token) return;

    await sendExpoPush(userId, token, {
      title: 'Synastry Reading Ready',
      body: 'Your relationship breakdown is in. Tap to see how your charts compare.',
      data: { screen: '/connection/[id]/synastry', connectionId },
    }, 'notifySynastryReady');
  }
);

// ─── parseConnectionCompatibility ────────────────────────────────────────────

/**
 * Parses the AI compatibility response into the parent connection doc and
 * enqueues a randomly-timed afternoon push (12-5 PM user local) so the user
 * gets notified some time later in the day rather than the moment generation
 * completes — feels less like a system notification, more like a check-in.
 */
export const parseConnectionCompatibility = onDocumentUpdated(
  'users/{userId}/connections/{connectionId}/report/{reportId}',
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const { userId, connectionId } = event.params;

    if (!after?.response) return;
    if (before?.response === after.response) return;

    const connectionRef = db
      .collection('users').doc(userId)
      .collection('connections').doc(connectionId);

    let parseOk = false;
    try {
      const raw = after.response as string;
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(clean);

      await connectionRef.update({
        compatibility: parsed,
        'status.state': 'complete',
      });
      parseOk = true;
    } catch (err) {
      console.error('[parseConnectionCompatibility] Parse error:', err);
      await connectionRef.update({
        'status.state': 'error',
      });
    }

    if (!parseOk) return;

    // Compute a random afternoon (12-5 PM) hour in the user's local timezone
    // and enqueue a delayed push. The hourly drain delivers it on the next
    // tick at-or-after the chosen time.
    const userSnap = await db.collection('users').doc(userId).get();
    const userData = userSnap.data();
    const offset = userData?.timezoneOffsetMinutes;
    if (typeof offset !== 'number' || !Number.isFinite(offset)) {
      // No timezone — send immediately so they at least find out.
      const token = userData?.expoPushToken as string | undefined;
      if (token) {
        await sendExpoPush(userId, token, {
          title: 'Connection Report Ready',
          body: 'Your new compatibility report just dropped. Tap to read.',
          data: { screen: '/connection/[id]', connectionId },
        }, 'parseConnectionCompatibility');
      }
      return;
    }

    const now = new Date();
    const localMs = now.getTime() + offset * 60 * 1000;
    const local = new Date(localMs);
    const localHour = local.getUTCHours();

    // Random hour 12,13,14,15,16; random minute 0-59.
    const targetHour = 12 + (hashUid(`${userId}:${connectionId}:${now.getUTCDate()}`) % 5);
    const targetMin = hashUid(`${userId}:${connectionId}:min:${now.getUTCDate()}`) % 60;

    // Build the target moment in user-local terms, then convert back to UTC.
    const localTarget = new Date(local);
    localTarget.setUTCHours(targetHour, targetMin, 0, 0);
    if (localHour >= 17) {
      // Already past the afternoon window — push tomorrow afternoon.
      localTarget.setUTCDate(localTarget.getUTCDate() + 1);
    }
    const sendAfter = new Date(localTarget.getTime() - offset * 60 * 1000);

    await enqueueDelayedPush(userId, sendAfter, {
      title: 'Connection Report Ready',
      body: 'Your new compatibility report just dropped. Tap to read.',
      data: { screen: '/connection/[id]', connectionId },
    });
  }
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
export const weeklyCleanup = onSchedule('every sunday 06:00', async () => {
  // Cutoff: 7 days before today, formatted as YYYY-MM-DD.
  // Any doc whose ID is strictly less than this string is eligible for deletion.
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const cutoffDateId = [
    cutoff.getUTCFullYear(),
    String(cutoff.getUTCMonth() + 1).padStart(2, '0'),
    String(cutoff.getUTCDate()).padStart(2, '0'),
  ].join('-');

  console.info(`[weeklyCleanup] cutoff date: ${cutoffDateId}`);

  // List all user document references (no data reads — paths only).
  const userRefs = await db.collection('users').listDocuments();

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
    await Promise.all(chunk.map(async (userRef) => {
      try {
        const [cardRefs, horoRefs, transitRefs] = await Promise.all([
          userRef.collection('cards').listDocuments(),
          userRef.collection('horoscope').listDocuments(),
          userRef.collection('transits').listDocuments(),
        ]);

        const oldCards      = cardRefs.filter(r => r.id < cutoffDateId);
        const oldHoroscopes = horoRefs.filter(r => r.id < cutoffDateId);
        const oldTransits   = transitRefs.filter(r => r.id < cutoffDateId);

        cardsDeleted      += oldCards.length;
        horoscopesDeleted += oldHoroscopes.length;
        transitsDeleted   += oldTransits.length;

        allToDelete.push(...oldCards, ...oldHoroscopes, ...oldTransits);
      } catch (err) {
        failedUsers++;
        console.error(`[weeklyCleanup] Failed to list docs for user ${userRef.id}:`, err);
      }
    }));
  }

  // Batch-delete in chunks of 500 (Firestore write-batch limit).
  const BATCH_SIZE = 500;
  for (let i = 0; i < allToDelete.length; i += BATCH_SIZE) {
    const batch = db.batch();
    allToDelete.slice(i, i + BATCH_SIZE).forEach(ref => batch.delete(ref));
    await batch.commit();
  }

  console.info(
    `[weeklyCleanup] queued ${cardsDeleted} cards, ` +
    `${horoscopesDeleted} horoscopes, ${transitsDeleted} transits for deletion` +
    (failedUsers > 0 ? `; ${failedUsers} user(s) failed to list` : ''),
  );
});

// ─── Shared helpers for aggregatePerfLogs ────────────────────────────────────

function formatDateId(d: Date): string {
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-');
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
export const aggregatePerfLogs = onSchedule('every day 02:00', async () => {
  const now = new Date();

  // Yesterday for the daily summary key
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayId = formatDateId(yesterday);

  // Time window: [start of yesterday, start of today)
  const startOfYesterday = new Date(Date.UTC(
    yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(),
  ));
  const startOfToday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
  ));

  // Raw event deletion cutoff (7 days ago)
  const rawCutoff = new Date(now);
  rawCutoff.setUTCDate(rawCutoff.getUTCDate() - 7);

  // Daily summary deletion cutoff (90 days ago as YYYY-MM-DD string)
  const dailyCutoff = new Date(now);
  dailyCutoff.setUTCDate(dailyCutoff.getUTCDate() - 90);
  const dailyCutoffId = formatDateId(dailyCutoff);

  const screenRefs = await db.collection('performanceLogs').listDocuments();
  if (screenRefs.length === 0) {
    console.info('[aggregatePerfLogs] No screen docs — nothing to aggregate');
    return;
  }

  let totalAggregated = 0;
  let failedScreens   = 0;

  const CONCURRENCY = 10;
  for (let i = 0; i < screenRefs.length; i += CONCURRENCY) {
    const chunk = screenRefs.slice(i, i + CONCURRENCY);

    await Promise.all(chunk.map(async (screenRef) => {
      const slug = screenRef.id;
      try {
        // ── 1. Query yesterday's events ──────────────────────────────────
        const eventsSnap = await screenRef.collection('events')
          .where('timestamp', '>=', Timestamp.fromDate(startOfYesterday))
          .where('timestamp', '<',  Timestamp.fromDate(startOfToday))
          .get();

        if (!eventsSnap.empty) {
          const events = eventsSnap.docs.map(d => d.data());

          // ── 2. Compute screen_load stats ─────────────────────────────
          const loadDurations = events
            .filter(e => e.metricType === 'screen_load' && typeof e.durationMs === 'number')
            .map(e => e.durationMs as number)
            .sort((a, b) => a - b);

          const screenLoad = loadDurations.length > 0 ? {
            count:  loadDurations.length,
            sumMs:  loadDurations.reduce((s, v) => s + v, 0),
            minMs:  loadDurations[0],
            maxMs:  loadDurations[loadDurations.length - 1],
            p50Ms:  percentile(loadDurations, 50),
            p95Ms:  percentile(loadDurations, 95),
          } : null;

          // ── 3. Compute per-operation ai_call stats ───────────────────
          const opEvents = events.filter(e => e.metricType === 'ai_call' && e.operationName);
          const opNames  = [...new Set(opEvents.map(e => e.operationName as string))];

          const operations: Record<string, {
            count: number; sumMs: number; p50Ms: number; p95Ms: number;
          }> = {};

          for (const opName of opNames) {
            const durations = opEvents
              .filter(e => e.operationName === opName && typeof e.durationMs === 'number')
              .map(e => e.durationMs as number)
              .sort((a, b) => a - b);
            operations[opName] = {
              count: durations.length,
              sumMs: durations.reduce((s, v) => s + v, 0),
              p50Ms: percentile(durations, 50),
              p95Ms: percentile(durations, 95),
            };
          }

          // ── 4. Count errors ──────────────────────────────────────────
          const errorCount = events.filter(e => e.metricType === 'error').length;

          // ── 5. Write daily summary ───────────────────────────────────
          await screenRef.collection('daily').doc(yesterdayId).set({
            screen:       eventsSnap.docs[0].data().screen ?? slug,
            date:         yesterdayId,
            ...(screenLoad ? { screenLoad } : {}),
            operations,
            errorCount,
            totalEvents:  events.length,
            updatedAt:    FieldValue.serverTimestamp(),
          });

          totalAggregated += events.length;
        }

        // ── 6. Delete raw events older than 7 days ───────────────────
        const oldEventsSnap = await screenRef.collection('events')
          .where('timestamp', '<', Timestamp.fromDate(rawCutoff))
          .limit(500)
          .get();

        if (!oldEventsSnap.empty) {
          const BATCH_SIZE = 500;
          for (let j = 0; j < oldEventsSnap.docs.length; j += BATCH_SIZE) {
            const batch = db.batch();
            oldEventsSnap.docs.slice(j, j + BATCH_SIZE).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        }

        // ── 7. Delete daily docs older than 90 days ──────────────────
        const dailyRefs = await screenRef.collection('daily').listDocuments();
        const oldDaily  = dailyRefs.filter(r => r.id < dailyCutoffId);
        if (oldDaily.length > 0) {
          const batch = db.batch();
          oldDaily.forEach(r => batch.delete(r));
          await batch.commit();
        }

      } catch (err) {
        failedScreens++;
        console.error(`[aggregatePerfLogs] Failed for screen "${slug}":`, err);
      }
    }));
  }

  console.info(
    `[aggregatePerfLogs] done — ${totalAggregated} events aggregated` +
    (failedScreens > 0 ? `, ${failedScreens} screen(s) failed` : ''),
  );
});
