import { doc, getDoc } from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import { fetchSynastryReading } from '@/src/services/synastry-reading.service';

interface PersonInfo {
  firstName?: string;
  lastName?: string;
  pronouns?: string;
  sun?: string;
  moon?: string;
  rising?: string;
}

interface CompatibilityReport {
  advice?: string;
  scores?: Record<string, number | undefined>;
}

interface ConnectionDoc {
  connectionId?: string;
  relationshipType?: string;
  firstPerson?: PersonInfo;
  secondPerson?: PersonInfo;
  compatibility?: CompatibilityReport;
}

export interface ConnectionContext {
  id: string;
  name: string;
  contextSummary: string;
}

function describePerson(p: PersonInfo | undefined, fallback: string): string {
  const name = [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim() || fallback;
  const placements = [
    p?.sun && `${p.sun} sun`,
    p?.moon && `${p.moon} moon`,
    p?.rising && `${p.rising} rising`,
  ].filter(Boolean).join(', ');
  const pronouns = p?.pronouns ? ` (${p.pronouns})` : '';
  return placements ? `${name}${pronouns} — ${placements}` : `${name}${pronouns}`;
}

function topScores(scores: Record<string, number | undefined> | undefined, take: number): string {
  if (!scores) return '';
  const entries = Object.entries(scores)
    .filter(([, v]) => typeof v === 'number') as [string, number][];
  if (entries.length === 0) return '';
  const high = [...entries].sort((a, b) => b[1] - a[1]).slice(0, take);
  const low = [...entries].sort((a, b) => a[1] - b[1]).slice(0, take);
  const fmt = (kv: [string, number]) => `${kv[0]} ${Math.round(kv[1])}%`;
  return `Strengths: ${high.map(fmt).join(', ')}. Friction: ${low.map(fmt).join(', ')}.`;
}

/**
 * Builds a compact text block describing a saved connection so the chat AI
 * can reason about that specific relationship. Pulls relationship type, both
 * people's basics, the compatibility scores + advice, and (if generated) the
 * cached synastry reading. Falls back gracefully when fields are missing.
 */
export async function buildConnectionContextSummary(
  uid: string,
  connectionId: string,
): Promise<ConnectionContext | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'connections', connectionId));
  if (!snap.exists()) return null;

  const data = snap.data() as ConnectionDoc;
  const fp = data.firstPerson;
  const sp = data.secondPerson;
  const fpName = fp?.firstName || 'Person 1';
  const spName = sp?.firstName || 'Person 2';
  const displayName = spName;

  const lines: string[] = [];
  lines.push(`Relationship: ${fpName} (the user) and ${spName}.`);
  if (data.relationshipType) {
    lines.push(`Status the user labeled it: ${data.relationshipType}.`);
  }
  lines.push(`User: ${describePerson(fp, fpName)}.`);
  lines.push(`Other person: ${describePerson(sp, spName)}.`);

  const scoreLine = topScores(data.compatibility?.scores, 3);
  if (scoreLine) lines.push(scoreLine);
  if (data.compatibility?.advice) {
    lines.push(`Weekly advice on file: ${data.compatibility.advice}`);
  }

  try {
    const reading = await fetchSynastryReading(uid, connectionId);
    if (reading.result) {
      lines.push(`Love language: ${reading.result.loveLanguage}`);
      lines.push(`Conflict style: ${reading.result.conflictStyle}`);
      lines.push(`Longevity: ${reading.result.longevity}`);
    }
  } catch {
    // synastry reading is optional context — ignore failures
  }

  return {
    id: connectionId,
    name: displayName,
    contextSummary: lines.join('\n'),
  };
}
