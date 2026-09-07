/**
 * moderation.ts — user controls: ban/disable, per-feature blocks, and premium
 * grants.
 *
 * Reads come straight from `moderation/{uid}` via the admin catch-all rule.
 * Writes never do: they go through callables that hold the `admin` claim check
 * and, for grants, the RevenueCat secret key that must never reach a browser.
 */

import { doc, getDoc, type Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from './firebase';

/**
 * Keep in step with BLOCKABLE_FEATURES in functions/src/index.ts and
 * src/constants/moderation.ts. The server list is the enforced one — an entry
 * here that the server does not know about is rejected by its zod schema.
 */
export const BLOCKABLE_FEATURES = ['chat', 'tarot', 'connections'] as const;

export type BlockableFeature = (typeof BLOCKABLE_FEATURES)[number];

export const FEATURE_LABELS: Record<BlockableFeature, string> = {
  chat: 'AI chat',
  tarot: 'Tarot readings',
  connections: 'Connections & compatibility',
};

/** Entitlements the grant control offers. Mirrors KNOWN_ENTITLEMENT_IDS. */
export const ENTITLEMENT_IDS = ['Delaluna Answers Pro', 'Pro-Trial'] as const;
export type EntitlementId = (typeof ENTITLEMENT_IDS)[number];

export const DURATIONS = [
  'daily',
  'three_day',
  'weekly',
  'monthly',
  'two_month',
  'three_month',
  'six_month',
  'yearly',
  'lifetime',
] as const;
export type Duration = (typeof DURATIONS)[number];

export interface ModerationState {
  disabled: boolean;
  blockedFeatures: BlockableFeature[];
  note: string;
  updatedAt: Timestamp | null;
  updatedBy: string | null;
  /** False when no document exists — the account has never been moderated. */
  exists: boolean;
}

const EMPTY: ModerationState = {
  disabled: false,
  blockedFeatures: [],
  note: '',
  updatedAt: null,
  updatedBy: null,
  exists: false,
};

export async function getModeration(uid: string): Promise<ModerationState> {
  const snap = await getDoc(doc(db, 'moderation', uid));
  if (!snap.exists()) return EMPTY;
  const d = snap.data() as Record<string, unknown>;
  return {
    disabled: d.disabled === true,
    blockedFeatures: Array.isArray(d.blockedFeatures)
      ? (d.blockedFeatures as BlockableFeature[])
      : [],
    note: typeof d.note === 'string' ? d.note : '',
    updatedAt: (d.updatedAt as Timestamp) ?? null,
    updatedBy: typeof d.updatedBy === 'string' ? d.updatedBy : null,
    exists: true,
  };
}

/** Turns a callable's HttpsError into the message the server actually sent. */
function callableMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.message) return e.message.replace(/^[a-z-]+:\s*/i, '');
  return 'The request failed.';
}

export async function setUserDisabled(
  targetUid: string,
  disabled: boolean,
  note?: string,
): Promise<void> {
  try {
    await httpsCallable(
      functions,
      'setUserDisabled',
    )({ targetUid, disabled, note });
  } catch (err) {
    throw new Error(callableMessage(err));
  }
}

export async function setUserFeatureBlocks(
  targetUid: string,
  blockedFeatures: BlockableFeature[],
  note?: string,
): Promise<void> {
  try {
    await httpsCallable(
      functions,
      'setUserFeatureBlocks',
    )({ targetUid, blockedFeatures, note });
  } catch (err) {
    throw new Error(callableMessage(err));
  }
}

export async function setEntitlement(
  targetUid: string,
  entitlementId: EntitlementId,
  action: 'grant' | 'revoke',
  duration?: Duration,
): Promise<void> {
  try {
    await httpsCallable(
      functions,
      'setEntitlementOverride',
    )(
      action === 'grant'
        ? { action, targetUid, entitlementId, duration }
        : { action, targetUid, entitlementId },
    );
  } catch (err) {
    throw new Error(callableMessage(err));
  }
}
