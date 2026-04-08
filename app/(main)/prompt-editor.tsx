/**
 * prompt-editor.tsx
 * Admin-only screen for viewing, editing, and resending AI prompt templates.
 * Overrides are persisted in AsyncStorage and used by the "resend" action
 * which writes the rendered prompt directly to Firestore.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { db } from '@/firebaseConfig';
import { useHoroscope } from '@/src/context/horoscope-context';
import { useUser } from '@/src/context/user-context';
import { useTheme } from '@/src/hooks/use-theme';
import { useResponsive } from '@/src/hooks/use-responsive';
import { calculateTransits } from '@/src/services/astroEngine';
import {
  clearPromptOverride,
  loadPromptOverrides,
  savePromptOverride,
  getPromptOverride,
  hasPromptOverride,
} from '@/src/services/prompt-overrides.service';
import { HOROSCOPE_PROMPT_TEMPLATE } from '@/src/prompts/horoscope-prompt';
import { TRANSITS_PROMPT_TEMPLATE } from '@/src/prompts/transits-prompt';
import { COMPATIBILITY_PROMPT_TEMPLATE } from '@/src/prompts/compatibility-prompt';
import {
  NATAL_CHART_PROMPT_TEMPLATE,
  buildNatalChartPrompt,
} from '@/src/prompts/natal-chart-prompt';
import { CHAT_SYSTEM_PROMPT_TEMPLATE } from '@/src/prompts/chat-prompt';
import { getTodayDateId } from '@/src/services/horoscope.service';
import { getThisWeekDateId } from '@/src/services/transit-reading.service';

// ─── Prompt definitions ───────────────────────────────────────────────────────

type ResendTarget = 'horoscope' | 'transits' | 'birthchart' | null;

interface PromptDef {
  key: string;
  label: string;
  defaultTemplate: string;
  resendTarget: ResendTarget;
  resendLabel?: string;
}

const PROMPT_DEFS: PromptDef[] = [
  {
    key: 'horoscope',
    label: 'Horoscope',
    defaultTemplate: HOROSCOPE_PROMPT_TEMPLATE,
    resendTarget: 'horoscope',
    resendLabel: 'Resend Today\'s Horoscope',
  },
  {
    key: 'transits',
    label: 'Transit Reading',
    defaultTemplate: TRANSITS_PROMPT_TEMPLATE,
    resendTarget: 'transits',
    resendLabel: 'Resend This Week\'s Transits',
  },
  {
    key: 'birthchart',
    label: 'Birth Chart',
    defaultTemplate: NATAL_CHART_PROMPT_TEMPLATE,
    resendTarget: 'birthchart',
    resendLabel: 'Resend Birth Chart',
  },
  {
    key: 'chat',
    label: 'Chat (System Prompt)',
    defaultTemplate: CHAT_SYSTEM_PROMPT_TEMPLATE,
    resendTarget: null,
  },
  {
    key: 'connection',
    label: 'Compatibility / Connection',
    defaultTemplate: COMPATIBILITY_PROMPT_TEMPLATE,
    resendTarget: null,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildNatalChartJson(chart: any): string {
  return JSON.stringify({
    planets: chart.planets.map((p: any) => ({
      name: p.name, sign: p.sign, house: p.house,
      degree: p.degree, isRetrograde: p.isRetrograde,
    })),
    houses: chart.houses.cusps.slice(1).map((cusp: number, i: number) => ({
      house: i + 1, cusp: Math.round(cusp),
    })),
    ascendant: { sign: chart.ascendant.sign, degree: chart.ascendant.degree },
    midheaven: { sign: chart.midheaven.sign, degree: chart.midheaven.degree },
  });
}

function buildTransitsJson(transits: any): string {
  return JSON.stringify({
    date: transits.date.toISOString(),
    moon: {
      sign: transits.moon.sign, phase: transits.moon.phase,
      illumination: transits.moon.illumination, degree: transits.moon.degree,
    },
    planets: transits.planets.map((p: any) => ({
      name: p.name, sign: p.sign, house: p.house,
      degree: p.degree, isRetrograde: p.isRetrograde,
    })),
  });
}

function formatDateLabel(dateId: string): string {
  const [y, m, d] = dateId.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatMoon(moon: any): string {
  return `${moon.sign} Moon, ${moon.phase}, ${moon.degree}° ${moon.illumination}% illumination`;
}

function substitute(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v),
    template,
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ResendStatus = 'idle' | 'loading' | 'success' | 'error';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PromptEditorScreen() {
  const { authUser, userDoc } = useUser();
  const { chartDetails, transitMoon, transitRetrogrades } = useHoroscope();
  const { theme: { colors: C } } = useTheme();
  const { moderateScale: ms } = useResponsive();
  const insets = useSafeAreaInsets();

  // Whether overrides have been loaded from AsyncStorage
  const [ready, setReady] = useState(false);

  // Current text for each prompt (override if set, else default)
  const [texts, setTexts] = useState<Record<string, string>>(
    Object.fromEntries(PROMPT_DEFS.map(p => [p.key, p.defaultTemplate])),
  );

  // Which keys currently have overrides
  const [overriddenKeys, setOverriddenKeys] = useState<Set<string>>(new Set());

  // Modal state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // Resend status per prompt key
  const [resendStatus, setResendStatus] = useState<Record<string, ResendStatus>>(
    Object.fromEntries(PROMPT_DEFS.map(p => [p.key, 'idle' as ResendStatus])),
  );

  // Load saved overrides on mount
  useEffect(() => {
    loadPromptOverrides().then(() => {
      const updated: Record<string, string> = {};
      const overridden = new Set<string>();
      for (const def of PROMPT_DEFS) {
        const override = getPromptOverride(def.key);
        updated[def.key] = override ?? def.defaultTemplate;
        if (override !== null) overridden.add(def.key);
      }
      setTexts(updated);
      setOverriddenKeys(overridden);
      setReady(true);
    });
  }, []);

  // ─── Edit modal ─────────────────────────────────────────────────────────────

  const openEditor = (key: string) => {
    setEditingKey(key);
    setEditingText(texts[key]);
  };

  const saveEdit = async () => {
    if (!editingKey) return;
    const def = PROMPT_DEFS.find(p => p.key === editingKey)!;
    const isDefault = editingText.trim() === def.defaultTemplate.trim();

    if (isDefault) {
      await clearPromptOverride(editingKey);
      setOverriddenKeys(prev => { const s = new Set(prev); s.delete(editingKey); return s; });
    } else {
      await savePromptOverride(editingKey, editingText);
      setOverriddenKeys(prev => new Set([...prev, editingKey]));
    }
    setTexts(prev => ({ ...prev, [editingKey]: editingText }));
    setEditingKey(null);
  };

  const cancelEdit = () => setEditingKey(null);

  // ─── Revert ─────────────────────────────────────────────────────────────────

  const revert = async (key: string) => {
    const def = PROMPT_DEFS.find(p => p.key === key)!;
    await clearPromptOverride(key);
    setTexts(prev => ({ ...prev, [key]: def.defaultTemplate }));
    setOverriddenKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
  };

  // ─── Resend ─────────────────────────────────────────────────────────────────

  const resend = async (def: PromptDef) => {
    const uid = authUser?.uid;
    if (!uid || !chartDetails || !def.resendTarget) return;

    setResendStatus(prev => ({ ...prev, [def.key]: 'loading' }));
    try {
      const template = texts[def.key];
      const pronouns  = userDoc?.pronouns ?? 'they/them';
      const natalJson = buildNatalChartJson(chartDetails);

      if (def.resendTarget === 'horoscope') {
        const dateId   = getTodayDateId();
        const moon     = transitMoon ?? chartDetails.moon;
        const retroStr = transitRetrogrades.length > 0 ? transitRetrogrades.join(', ') : 'none';
        const prompt   = substitute(template, {
          natalChart:        natalJson,
          date:              formatDateLabel(dateId),
          todaysMoon:        formatMoon(moon),
          retrogradeplanets: retroStr,
          tarotKeywords:     '',
          pronouns,
        });
        await setDoc(doc(db, 'users', uid, 'horoscope', dateId), {
          prompt, requestedAt: serverTimestamp(),
        });

      } else if (def.resendTarget === 'transits') {
        const lat      = userDoc?.birthLat ?? 0;
        const lon      = userDoc?.birthLon ?? 0;
        const weekId   = getThisWeekDateId();
        const transits = await calculateTransits(new Date(), lat, lon);
        const prompt   = substitute(template, {
          natalChart:      natalJson,
          currentTransits: buildTransitsJson(transits),
          date:            formatDateLabel(weekId),
          pronouns,
        });
        await setDoc(doc(db, 'users', uid, 'transits', weekId), {
          prompt, requestedAt: serverTimestamp(),
        });

      } else if (def.resendTarget === 'birthchart') {
        const prompt = buildNatalChartPrompt(natalJson, pronouns, template);
        await setDoc(
          doc(db, 'users', uid, 'natalChart', 'details'),
          { prompt, natalChart: natalJson, requestedAt: serverTimestamp() },
          { merge: true },
        );
      }

      setResendStatus(prev => ({ ...prev, [def.key]: 'success' }));
      setTimeout(() => setResendStatus(prev => ({ ...prev, [def.key]: 'idle' })), 3000);
    } catch (e) {
      console.error('[PromptEditor] resend error', e);
      setResendStatus(prev => ({ ...prev, [def.key]: 'error' }));
      setTimeout(() => setResendStatus(prev => ({ ...prev, [def.key]: 'idle' })), 4000);
    }
  };

  // ─── Styles ──────────────────────────────────────────────────────────────────

  const styles = StyleSheet.create({
    container:    { flex: 1 },
    content:      { paddingHorizontal: ms(20), paddingTop: ms(8), gap: ms(12) },
    pageTitle:    { color: C.headerText, fontSize: ms(22), fontWeight: '700', marginBottom: ms(4) },
    card: {
      backgroundColor: C.overlay,
      borderRadius: ms(12),
      padding: ms(14),
      gap: ms(10),
    },
    cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: ms(8) },
    cardTitle:    { color: C.text, fontSize: ms(14), fontWeight: '700', flex: 1 },
    badge: {
      backgroundColor: C.activeTab,
      borderRadius: ms(4),
      paddingHorizontal: ms(6),
      paddingVertical: ms(2),
    },
    badgeText:    { color: C.headerText, fontSize: ms(10), fontWeight: '700' },
    preview: {
      color: C.text,
      fontSize: ms(11),
      opacity: 0.55,
    },
    row:          { flexDirection: 'row', gap: ms(8), flexWrap: 'wrap' },
    btn: {
      flex: 1,
      backgroundColor: C.primary,
      borderRadius: ms(8),
      paddingVertical: ms(10),
      alignItems: 'center',
      minWidth: ms(80),
    },
    btnOutline: {
      flex: 1,
      borderWidth: 1,
      borderColor: C.primary,
      borderRadius: ms(8),
      paddingVertical: ms(10),
      alignItems: 'center',
      minWidth: ms(80),
    },
    btnDanger: { flex: 1, backgroundColor: '#9E3030', borderRadius: ms(8), paddingVertical: ms(10), alignItems: 'center', minWidth: ms(80) },
    btnSuccess: { backgroundColor: '#4CAF50' },
    btnError:   { backgroundColor: '#F44336' },
    btnText:    { color: C.headerText, fontSize: ms(13), fontWeight: '600' },
    btnTextOutline: { color: C.primary, fontSize: ms(13), fontWeight: '600' },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
    modalCard: {
      flex: 1,
      marginTop: insets.top + ms(16),
      marginHorizontal: ms(8),
      marginBottom: insets.bottom + ms(8),
      backgroundColor: C.headerBg,
      borderRadius: ms(16),
      overflow: 'hidden',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: ms(16),
      paddingVertical: ms(12),
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    modalTitle:   { color: C.headerText, fontSize: ms(15), fontWeight: '700', flex: 1 },
    modalCancel:  { color: C.text, fontSize: ms(14), opacity: 0.6, paddingHorizontal: ms(8) },
    modalSave:    { color: C.activeTab, fontSize: ms(14), fontWeight: '700', paddingHorizontal: ms(8) },
    modalInput: {
      flex: 1,
      color: C.text,
      fontSize: ms(12),
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      lineHeight: ms(18),
      padding: ms(16),
      textAlignVertical: 'top',
    },
  });

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={C.activeTab} />
      </View>
    );
  }

  const editingDef = PROMPT_DEFS.find(p => p.key === editingKey);

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + ms(24) }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.pageTitle, { marginTop: insets.top + ms(16) }]}>Prompt Editor</Text>

        {PROMPT_DEFS.map(def => {
          const isCustom  = overriddenKeys.has(def.key);
          const rStatus   = resendStatus[def.key];
          const preview   = texts[def.key].slice(0, 120).replace(/\n/g, ' ') + '…';

          return (
            <View key={def.key} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{def.label}</Text>
                {isCustom && (
                  <View style={styles.badge}><Text style={styles.badgeText}>CUSTOM</Text></View>
                )}
              </View>

              <Text style={styles.preview} numberOfLines={2}>{preview}</Text>

              <View style={styles.row}>
                <TouchableOpacity style={styles.btnOutline} onPress={() => openEditor(def.key)} activeOpacity={0.75}>
                  <Text style={styles.btnTextOutline}>Edit</Text>
                </TouchableOpacity>

                {isCustom && (
                  <TouchableOpacity style={styles.btnDanger} onPress={() => revert(def.key)} activeOpacity={0.75}>
                    <Text style={styles.btnText}>Revert</Text>
                  </TouchableOpacity>
                )}
              </View>

              {def.resendTarget && (
                <TouchableOpacity
                  style={[
                    styles.btn,
                    rStatus === 'success' && styles.btnSuccess,
                    rStatus === 'error'   && styles.btnError,
                  ]}
                  onPress={() => resend(def)}
                  disabled={rStatus === 'loading'}
                  activeOpacity={0.75}
                >
                  {rStatus === 'loading' ? (
                    <ActivityIndicator color={C.headerText} size="small" />
                  ) : (
                    <Text style={styles.btnText}>
                      {rStatus === 'success' ? 'Sent' :
                       rStatus === 'error'   ? 'Failed' :
                       def.resendLabel ?? 'Resend'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* ── Edit Modal ── */}
      <Modal visible={editingKey !== null} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Pressable onPress={cancelEdit}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </Pressable>
              <Text style={styles.modalTitle}>{editingDef?.label}</Text>
              <Pressable onPress={saveEdit}>
                <Text style={styles.modalSave}>Save</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.modalInput}
              multiline
              value={editingText}
              onChangeText={setEditingText}
              autoCorrect={false}
              autoCapitalize="none"
              scrollEnabled
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
