/**
 * "Export chat" bottom sheet: pick a format (copy as text, PDF, image) and what
 * to include, then one button does it. Opened from the chat header and from
 * each row of the chat history.
 *
 * Birth details default to off every time the sheet opens — an export is
 * usually headed somewhere public, and birth date, time and place together are
 * enough to identify someone.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import ChatExportCard, {
  CARD_HEIGHT,
  CARD_WIDTH,
} from '@/src/components/chat/chat-export-card';
import { C, R, S } from '@/src/constants/theme';
import { Events } from '@/src/services/analytics.service';
import {
  copyChatAsText,
  exportChatAsPdf,
  shareChatImage,
  ShareUnavailableError,
} from '@/src/services/chat-export.service';
import {
  exportSummaryLine,
  type ChatExportFormat,
  type ExportableChat,
} from '@/src/utils/chat-export-format';
import { logger } from '@/src/utils/logger';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const FORMATS: {
  id: ChatExportFormat;
  title: string;
  description: string;
  icon: IoniconName;
  action: string;
}[] = [
  {
    id: 'text',
    title: 'Copy as text',
    description: 'Paste it into notes or a message.',
    icon: 'copy-outline',
    action: 'Copy text',
  },
  {
    id: 'pdf',
    title: 'PDF',
    description: 'A clean page to save, print or send.',
    icon: 'document-text-outline',
    action: 'Export PDF',
  },
  {
    id: 'image',
    title: 'Image',
    description: 'A card of the latest reading, sized for stories.',
    icon: 'image-outline',
    action: 'Share image',
  },
];

/** A switch's visible caption, hidden because the Switch is labelled itself. */
const CAPTION_A11Y = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** How long "Copied" stays on the button before the sheet closes itself. */
const COPIED_CLOSE_MS = 1200;

interface Props {
  visible: boolean;
  chat: ExportableChat | null;
  /** Formatted birth line, or null when the profile has none — hides the switch. */
  birthDetails: string | null;
  /** Analytics only: where the sheet was opened from. */
  source: 'chat' | 'history';
  onClose: () => void;
}

export default function ChatExportSheet({
  visible,
  chat,
  birthDetails,
  source,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [format, setFormat] = useState<ChatExportFormat>('pdf');
  const [includeQuestions, setIncludeQuestions] = useState(true);
  const [includeBirth, setIncludeBirth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<View>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A fresh sheet every time it opens — in particular, birth details never
  // stay switched on from a previous export. Done during render on the
  // closed → open edge rather than in an effect, so the stale choices never
  // paint for a frame.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setFormat('pdf');
      setIncludeQuestions(true);
      setIncludeBirth(false);
      setBusy(false);
      setCopied(false);
    }
  }

  // A copy's auto-close belongs to the sheet that copied. Cleared whenever the
  // sheet closes, however it closes; left running it closed the next sheet
  // opened within COPIED_CLOSE_MS.
  useEffect(() => {
    if (visible) return;
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, [visible]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  if (!chat) return null;

  // Every way out goes through here, so a pending auto-close can't outlive it.
  const close = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    onClose();
  };

  const latest = chat.turns[chat.turns.length - 1];
  const selected = FORMATS.find((f) => f.id === format) ?? FORMATS[1];
  const options = {
    includeQuestions,
    birthDetails: includeBirth ? birthDetails : null,
  };

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (format === 'text') {
        await copyChatAsText(chat, options);
        setCopied(true);
        AccessibilityInfo.announceForAccessibility('Chat copied to clipboard');
        closeTimer.current = setTimeout(close, COPIED_CLOSE_MS);
      } else if (format === 'pdf') {
        await exportChatAsPdf(chat, options);
        close();
      } else {
        if (!cardRef.current) throw new Error('export card not mounted');
        const uri = await captureRef(cardRef, {
          format: 'png',
          quality: 1,
          width: CARD_WIDTH * 3,
          height: CARD_HEIGHT * 3,
          result: 'tmpfile',
        });
        await shareChatImage(uri);
        close();
      }
      Events.chatExported({
        format,
        source,
        includeQuestions,
        includeBirthDetails: includeBirth,
      });
    } catch (e) {
      if (e instanceof ShareUnavailableError) {
        Alert.alert('Sharing unavailable', "This device can't open the share sheet.");
      } else {
        logger.error('[chat-export] export failed', e, `chat_export_${format}`);
        Alert.alert("Couldn't export", 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const actionLabel = copied ? 'Copied' : selected.action;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropTouch}
          activeOpacity={1}
          onPress={close}
          accessible={false}
          importantForAccessibility="no"
        />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + S.md }]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              Export chat
            </Text>
            <TouchableOpacity
              onPress={close}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close export"
            >
              <Ionicons name="close" size={26} color={C.white} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.summary} accessible>
              <Text style={styles.summaryTitle} numberOfLines={2}>
                {chat.title}
              </Text>
              <Text style={styles.summaryMeta}>{exportSummaryLine(chat)}</Text>
            </View>

            <Text style={styles.sectionLabel} accessibilityRole="header">
              FORMAT
            </Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Format" style={styles.formats}>
              {FORMATS.map((f) => {
                const isSelected = f.id === format;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.formatRow, isSelected && styles.formatRowSelected]}
                    onPress={() => {
                      setFormat(f.id);
                      setCopied(false);
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={`${f.title}. ${f.description}`}
                  >
                    <View style={styles.formatIcon}>
                      <Ionicons name={f.icon} size={20} color={C.white} />
                    </View>
                    <View style={styles.formatText}>
                      <Text style={styles.formatTitle}>{f.title}</Text>
                      <Text style={styles.formatDescription}>{f.description}</Text>
                    </View>
                    <View style={[styles.radio, isSelected && styles.radioSelected]}>
                      {isSelected ? <View style={styles.radioDot} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionLabel} accessibilityRole="header">
              INCLUDE
            </Text>
            <View style={styles.toggleRow}>
              {/* The Switch carries this name; read once, not twice */}
              <Text style={styles.toggleLabel} {...CAPTION_A11Y}>Your questions</Text>
              <Switch
                value={includeQuestions}
                onValueChange={setIncludeQuestions}
                trackColor={{ false: C.purpleDim, true: C.turquoise }}
                thumbColor={includeQuestions ? C.cosmos : C.white}
                ios_backgroundColor={C.purpleDim}
                accessibilityLabel="Your questions"
              />
            </View>
            {birthDetails ? (
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel} {...CAPTION_A11Y}>Birth details</Text>
                <Switch
                  value={includeBirth}
                  onValueChange={setIncludeBirth}
                  trackColor={{ false: C.purpleDim, true: C.turquoise }}
                  thumbColor={includeBirth ? C.cosmos : C.white}
                  ios_backgroundColor={C.purpleDim}
                  accessibilityLabel="Birth details"
                  accessibilityHint="Adds your birth date, time and place"
                />
              </View>
            ) : null}
          </ScrollView>

          <TouchableOpacity
            style={[styles.primary, busy && styles.primaryBusy]}
            onPress={handleExport}
            disabled={busy || copied}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            accessibilityState={{ disabled: busy || copied, busy }}
          >
            {busy ? (
              <ActivityIndicator color={C.cosmos} />
            ) : (
              <View style={styles.primaryContent}>
                {copied ? (
                  <Ionicons name="checkmark" size={18} color={C.cosmos} />
                ) : null}
                <Text style={styles.primaryText}>{actionLabel.toUpperCase()}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Rendered off-screen only to be captured; never seen or read aloud. */}
        {format === 'image' ? (
          <View
            pointerEvents="none"
            style={styles.offscreen}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <ChatExportCard
              ref={cardRef}
              turn={latest}
              includeQuestion={includeQuestions}
              birthDetails={options.birthDetails}
            />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: C.void,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.white + '14',
    paddingHorizontal: S.md,
    paddingTop: S.sm,
    maxHeight: '92%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.white + '40',
    marginBottom: S.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: S.md,
  },
  title: {
    color: C.white,
    fontSize: 22,
    fontWeight: '700',
  },
  body: {
    paddingBottom: S.md,
  },
  summary: {
    padding: S.md,
    borderRadius: R.md,
    backgroundColor: C.white + '0D',
    borderWidth: 1,
    borderColor: C.white + '1A',
    gap: S.xs,
  },
  summaryTitle: {
    color: C.white,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  summaryMeta: {
    color: C.muted,
    fontSize: 13,
  },
  sectionLabel: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: S.lg,
    marginBottom: S.sm,
  },
  formats: {
    gap: S.sm,
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm + 4,
    minHeight: 64,
    padding: S.sm + 4,
    borderRadius: R.md,
    backgroundColor: C.white + '0D',
    borderWidth: 1,
    borderColor: C.white + '1A',
  },
  formatRowSelected: {
    borderColor: C.turquoise,
    backgroundColor: C.white + '14',
  },
  formatIcon: {
    width: 44,
    height: 44,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.white + '14',
  },
  formatText: {
    flex: 1,
  },
  formatTitle: {
    color: C.white,
    fontSize: 16,
    fontWeight: '700',
  },
  formatDescription: {
    color: C.muted,
    fontSize: 13,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: C.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: C.turquoise,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.turquoise,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    gap: S.md,
  },
  toggleLabel: {
    flex: 1,
    color: C.white,
    fontSize: 16,
  },
  primary: {
    minHeight: 52,
    paddingVertical: S.sm + 6,
    borderRadius: R.pill,
    backgroundColor: C.turquoise,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: S.sm,
  },
  primaryBusy: {
    opacity: 0.7,
  },
  primaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.xs,
  },
  primaryText: {
    color: C.cosmos,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  offscreen: {
    position: 'absolute',
    top: 0,
    left: -CARD_WIDTH * 4,
  },
});
