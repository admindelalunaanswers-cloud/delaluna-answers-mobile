import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { logger } from '@/src/utils/logger';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { db } from '@/firebaseConfig';
import { C, R, S } from '@/src/constants/theme';

export interface PickerConnection {
  id: string;
  name: string;
  relationshipType?: string;
}

interface Props {
  visible: boolean;
  uid: string | undefined;
  onClose: () => void;
  onSelect: (connection: PickerConnection) => void;
}

export default function ConnectionPickerSheet({ visible, uid, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const [connections, setConnections] = useState<PickerConnection[]>([]);

  useEffect(() => {
    if (!visible || !uid) return;
    const q = query(
      collection(db, 'users', uid, 'connections'),
      orderBy('createTime', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const fresh: PickerConnection[] = snap.docs.map((d) => {
        const data = d.data() as any;
        const fp = data.firstPerson?.firstName as string | undefined;
        const sp = data.secondPerson?.firstName as string | undefined;
        const name = sp || data.name || [fp, sp].filter(Boolean).join(' & ') || d.id;
        return {
          id: d.id,
          name,
          relationshipType: data.relationshipType,
        };
      });
      setConnections(fresh);
    },
    // connections is gated on isVerifiedOwner; show an empty picker instead of
    // an uncaught listener error.
    (err) => {
      logger.error('[connection-picker] listener failed', err, 'connection_picker_snapshot');
      setConnections([]);
    });
    return () => unsub();
  }, [visible, uid]);

  const handleGoToConnections = () => {
    onClose();
    router.push('/(main)/connections');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Tap-outside-to-close is for touch; to a screen reader it was an empty,
            unnamed element. Close and the Android back button cover it. */}
        <TouchableOpacity
          style={styles.backdropTouch}
          activeOpacity={1}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + S.md }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">Talk about a connection</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={C.white} />
            </TouchableOpacity>
          </View>

          {connections.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No connections yet</Text>
              <Text style={styles.emptyBody}>
                Save someone in Connections, then come back to chat about them.
              </Text>
              <TouchableOpacity
                style={styles.emptyCta}
                onPress={handleGoToConnections}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.emptyCtaText}>Go to Connections</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
              {connections.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.row}
                  onPress={() => onSelect(c)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                    {c.relationshipType ? (
                      <Text style={styles.rowMeta} numberOfLines={1}>{c.relationshipType}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.muted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: '#15152a',
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    paddingHorizontal: S.md,
    paddingTop: S.sm,
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: S.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: S.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: C.white,
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    paddingTop: S.sm,
    gap: S.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: R.md,
    paddingHorizontal: S.md,
    paddingVertical: S.sm + 2,
  },
  rowText: { flex: 1, marginRight: S.sm },
  rowName: {
    color: C.white,
    fontSize: 14,
    fontWeight: '500',
  },
  rowMeta: {
    color: C.muted,
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: S.xl,
    paddingHorizontal: S.md,
    gap: S.sm,
  },
  emptyTitle: {
    color: C.white,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyBody: {
    color: C.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyCta: {
    marginTop: S.sm,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    borderRadius: R.pill,
    backgroundColor: C.purple,
  },
  emptyCtaText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '600',
  },
});
