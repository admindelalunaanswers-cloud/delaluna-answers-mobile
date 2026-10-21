import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  ImageSourcePropType,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';

import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ThemedView } from '@/src/components/themed-view';
import HeaderNav from '@/src/components/shared/header-nav';
import { useUser } from '@/src/context/user-context';
import { updateUserDoc } from '@/src/services/user.service';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';

// ─── Image registry ────────────────────────────────────────────────────────────
// Add or remove entries here as your image library grows.
// `id` is what gets stored in Firestore as `profileImageId`.

export type ProfileImageId =
  | 'profile1' | 'profile2' | 'profile3' | 'profile4' | 'profile5'
  | 'profile6' | 'profile7' | 'profile8' | 'profile9' | 'profile10';

interface ProfileImageOption {
  id: ProfileImageId;
  label: string;
  source: ImageSourcePropType;
}

export const PROFILE_IMAGES: ProfileImageOption[] = [
  { id: 'profile1',  label: 'Saturn',      source: require('@/src/assets/profile/profile1.png') },
  { id: 'profile2',  label: 'Black Cat',   source: require('@/src/assets/profile/profile2.png') },
  { id: 'profile3',  label: 'Locks',       source: require('@/src/assets/profile/profile3.png') },
  { id: 'profile4',  label: 'Boat',        source: require('@/src/assets/profile/profile4.png') },
  { id: 'profile5',  label: 'Flower',      source: require('@/src/assets/profile/profile5.png') },
  { id: 'profile6',  label: 'Drawing',     source: require('@/src/assets/profile/profile6.png') },
  { id: 'profile7',  label: 'Waves',       source: require('@/src/assets/profile/profile7.png') },
  { id: 'profile8',  label: 'Moon',        source: require('@/src/assets/profile/profile8.png') },
  { id: 'profile9',  label: 'Tarot Card',  source: require('@/src/assets/profile/profile9.png') },
  { id: 'profile10', label: 'Lanterns',    source: require('@/src/assets/profile/profile10.png') },
];

/** Returns the image source for a given profileImageId, or undefined if not found. */
export function getProfileImageSource(id: string | undefined) {
  return PROFILE_IMAGES.find(img => img.id === id)?.source;
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function SelectProfileImageScreen() {
  const { authUser, userDoc, refresh } = useUser();
  const insets = useSafeAreaInsets();

  const savedId = (userDoc as any)?.profileImageId ?? '';
  const [selectedId, setSelectedId] = useState<string>(savedId);
  const [saving, setSaving] = useState(false);

  const hasChanged = selectedId !== savedId;

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleBack = () => {
    if (hasChanged) {
      Alert.alert('Unsaved changes', 'Discard your selection and go back?', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  const handleSave = async () => {
    if (!authUser?.uid || !hasChanged || saving) return;
    setSaving(true);
    try {
      await updateUserDoc(authUser.uid, { profileImageId: selectedId } as any);
      await refresh();
      router.back();
    } catch {
      Alert.alert('Error', 'Could not save profile image. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const currentImage = getProfileImageSource(selectedId);

  return (
    <ThemedView style={ss.container}>
      <HeaderNav
        title="Choose Image"
        leftIconName="chevron-back-outline"
        onLeftPress={handleBack}
        rightLabel={saving ? 'Saving…' : 'Save'}
        onRightPress={handleSave}
        // Save is a no-op until the selection changes; say why instead of silently doing nothing
        rightAccessibilityLabel={saving ? 'Saving' : hasChanged ? 'Save' : 'Save, no changes yet'}
      />

      <ScrollView
        style={ss.scroll}
        contentContainerStyle={[
          ss.content,
          { paddingTop: insets.top + scale(44) + verticalScale(16) },
          { paddingBottom: insets.bottom + verticalScale(24) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Current preview ── */}
        <View style={ss.previewContainer}>
          <View style={ss.avatarRing}>
            {currentImage ? (
              <Image source={currentImage} style={ss.avatarImage} />
            ) : (
              <View style={ss.avatarPlaceholder}>
                <Ionicons name="person" size={scale(32)} color="rgba(255,255,255,0.3)" />
              </View>
            )}
          </View>
          <Text style={ss.previewLabel}>preview</Text>
        </View>

        {/* ── Grid ── */}
        <View style={ss.grid} accessibilityRole="radiogroup" accessibilityLabel="Profile image">
          {PROFILE_IMAGES.map(img => {
            const isSelected = img.id === selectedId;
            return (
              <TouchableOpacity
                key={img.id}
                style={ss.gridCell}
                onPress={() => setSelectedId(img.id)}
                activeOpacity={0.8}
                // Selection was only a border and a check icon
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={img.label}
              >
                <View style={[ss.gridItem, isSelected && ss.gridItemSelected]}>
                  <Image
                    source={img.source}
                    style={ss.gridImage}
                  />
                  {isSelected && (
                    <View style={ss.checkBadge}>
                      <Ionicons name="checkmark" size={scale(11)} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={[ss.gridLabel, isSelected && ss.gridLabelSelected]}>
                  {img.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const GRID_GAP    = scale(6);
const NUM_COLUMNS = 3;

const ss = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { flex: 1 },
  content:   { paddingHorizontal: scale(16), alignItems: 'center' },

  // Preview avatar
  previewContainer: { alignItems: 'center', marginBottom: verticalScale(20) },
  avatarRing: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(40),
    borderWidth: 2,
    borderColor: '#7c6ef7',
    overflow: 'hidden',
  },
  avatarImage:       { width: '100%', height: '100%' },
  avatarPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  previewLabel:      { color: 'rgba(255,255,255,0.7)', fontSize: moderateScale(11), marginTop: verticalScale(6) },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    width: '100%',
  },
  gridCell: {
    width: `${(100 - (NUM_COLUMNS - 1) * 2) / NUM_COLUMNS}%`,
    alignItems: 'center',
    gap: verticalScale(4),
  },
  gridItem: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: scale(10),
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  gridItemSelected: {
    borderColor: '#7c6ef7',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },

  gridLabel: {
    color: 'rgba(255,255,255,0.7)', // was 0.4 at 10pt, ~3:1
    fontSize: moderateScale(10),
    textAlign: 'center',
  },
  gridLabelSelected: {
    color: '#a78bfa',
    fontWeight: '600',
  },

  // Checkmark badge
  checkBadge: {
    position: 'absolute',
    top: scale(6),
    right: scale(6),
    width: scale(20),
    height: scale(20),
    borderRadius: scale(10),
    backgroundColor: '#7c6ef7',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
