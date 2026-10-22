// app/(settings)/accessibility.tsx
//
// In-app accessibility settings. Saved on the device only, through
// AccessibilityPrefsProvider (src/context/accessibility-context.tsx).
//
// Only settings that actually work are shown. Underline links and contrast are
// designed for this screen too, but have no hook into the app's styles yet — a
// control that changes nothing is worse than no control.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  // The "Aa" samples show each option's own size, so they must not also take
  // the size currently chosen — they skip the in-app scaling on purpose.
  // eslint-disable-next-line no-restricted-imports
  Text as FixedText,
} from "react-native";
import { Text } from "@/src/components/app-text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HeaderNav from "@/src/components/shared/header-nav";
import { ThemedView } from "@/src/components/themed-view";
import { C } from "@/src/constants/theme";
import { useAccessibilityPrefs } from "@/src/context/accessibility-context";
import {
  isDefaultPrefs,
  motionSystemCaption,
  TEXT_SIZE_SCALE,
  type MotionPref,
  type TextSizePref,
} from "@/src/utils/accessibility-prefs";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";

const NAV_BAR_HEIGHT = 44;
const MIN_TARGET = 44;

const TEXT_SIZE_OPTIONS: { value: TextSizePref; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
  { value: "xl", label: "Extra large" },
];
const SAMPLE_FONT_SIZE = moderateScale(16);

const MOTION_OPTIONS: { value: MotionPref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "reduced", label: "Reduced" },
];

export default function AccessibilityScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + verticalScale(NAV_BAR_HEIGHT);
  const { prefs, system, updatePrefs, resetPrefs } = useAccessibilityPrefs();
  const atDefaults = isDefaultPrefs(prefs);

  const toggleIgnoreTheme = () =>
    updatePrefs({ ignoreCustomTheme: !prefs.ignoreCustomTheme });

  const handleReset = () => {
    if (atDefaults) return;
    resetPrefs();
    // Nothing moves focus, and several controls change at once.
    AccessibilityInfo.announceForAccessibility("Accessibility settings reset to defaults.");
  };

  return (
    <ThemedView style={styles.container}>
      <HeaderNav
        title="Accessibility"
        leftIconName="arrow-back"
        onLeftPress={() => router.back()}
      />

      <ScrollView
        style={{ marginTop: headerHeight }}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + verticalScale(40) },
        ]}
      >
        <Text style={styles.intro}>
          Adjust how things look and move to make your experience more comfortable.
        </Text>
        <View style={styles.noteRow}>
          <Ionicons
            name="phone-portrait-outline"
            size={moderateScale(14)}
            color={MUTED}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={styles.note}>
            Changes apply automatically and are saved on this device.
          </Text>
        </View>

        {/* ── Text & readability ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            TEXT & READABILITY
          </Text>
          <Text style={styles.settingTitle}>Text size</Text>
          <Text style={styles.settingBody}>
            Adjust text size throughout the application.
          </Text>

          <View
            style={styles.segmentRow}
            accessibilityRole="radiogroup"
            accessibilityLabel="Text size"
          >
            {TEXT_SIZE_OPTIONS.map(({ value, label }) => {
              const selected = prefs.textSize === value;
              return (
                <Pressable
                  key={value}
                  style={[styles.segment, styles.sizeSegment, selected && styles.segmentSelected]}
                  onPress={() => updatePrefs({ textSize: value })}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{ checked: selected }}
                >
                  <FixedText
                    style={[
                      styles.sizeSample,
                      selected && styles.segmentLabelSelected,
                      { fontSize: SAMPLE_FONT_SIZE * TEXT_SIZE_SCALE[value] },
                    ]}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  >
                    Aa
                  </FixedText>
                  <View style={styles.sizeLabelRow}>
                    {selected ? (
                      <Ionicons
                        name="checkmark"
                        size={moderateScale(14)}
                        color={C.turquoise}
                        style={styles.segmentTick}
                      />
                    ) : null}
                    <Text style={[styles.sizeLabel, selected && styles.segmentLabelSelected]}>
                      {label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Display ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            DISPLAY
          </Text>

          {/* The row is the control: one element to a screen reader, and the
              whole row is the touch target rather than just the switch. */}
          <Pressable
            style={styles.switchRow}
            onPress={toggleIgnoreTheme}
            accessibilityRole="switch"
            accessibilityLabel="Ignore custom theme"
            accessibilityHint="Uses the standard theme instead of your chosen one. Your theme is kept for when you turn this off."
            accessibilityState={{ checked: prefs.ignoreCustomTheme }}
          >
            <View
              style={styles.switchText}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={styles.settingTitle}>Ignore custom theme</Text>
              <Text style={styles.settingBody}>
                Use the standard theme instead of your chosen one. Your theme is
                kept for when you turn this off.
              </Text>
            </View>
            <View
              style={styles.switchControl}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={styles.switchState}>
                {prefs.ignoreCustomTheme ? "On" : "Off"}
              </Text>
              <Switch
                value={prefs.ignoreCustomTheme}
                onValueChange={toggleIgnoreTheme}
                trackColor={{ false: "rgba(255,255,255,0.25)", true: C.turquoise }}
                thumbColor="#ffffff"
                ios_backgroundColor="rgba(255,255,255,0.25)"
              />
            </View>
          </Pressable>
        </View>

        {/* ── Motion ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            MOTION
          </Text>
          <Text style={styles.settingTitle}>Motion preference</Text>
          <Text style={styles.settingBody}>
            Limit decorative animation and movement.
          </Text>

          <View
            style={styles.segmentRow}
            accessibilityRole="radiogroup"
            accessibilityLabel="Motion preference"
          >
            {MOTION_OPTIONS.map(({ value, label }) => {
              const selected = prefs.motion === value;
              return (
                <Pressable
                  key={value}
                  style={[styles.segment, selected && styles.segmentSelected]}
                  onPress={() => updatePrefs({ motion: value })}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{ checked: selected }}
                >
                  {/* The tick, not just the colour, marks the choice. */}
                  {selected ? (
                    <Ionicons
                      name="checkmark"
                      size={moderateScale(16)}
                      color={C.turquoise}
                      style={styles.segmentTick}
                    />
                  ) : null}
                  <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {prefs.motion === "system" ? (
            <View style={styles.noteRow}>
              <Ionicons
                name="phone-portrait-outline"
                size={moderateScale(14)}
                color={MUTED}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text style={styles.note}>{motionSystemCaption(system)}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Preview ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            PREVIEW YOUR SETTINGS
          </Text>
          {/* One element, read as a sample. Its buttons are pictures of
              buttons: real ones that did nothing would be traps for a
              screen-reader user. */}
          <View
            style={styles.previewCard}
            accessible
            accessibilityLabel="Preview: Your daily reading. Give yourself room to slow down and reflect today, before you plan your week."
          >
            <Text style={styles.previewTitle}>Your daily reading</Text>
            <Text style={styles.previewBody}>
              Give yourself room to slow down and reflect today, before you plan
              your week.
            </Text>
            <View style={styles.previewButtons}>
              <View style={[styles.previewButton, styles.previewButtonPrimary]}>
                <Text style={styles.previewButtonPrimaryLabel}>Save reading</Text>
              </View>
              <View style={[styles.previewButton, styles.previewButtonSecondary]}>
                <Text style={styles.previewButtonSecondaryLabel}>Not now</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Reset ── */}
        <Pressable
          style={[styles.resetButton, atDefaults && styles.resetButtonDisabled]}
          onPress={handleReset}
          disabled={atDefaults}
          accessibilityRole="button"
          accessibilityLabel="Reset to defaults"
          accessibilityState={{ disabled: atDefaults }}
        >
          <Ionicons
            name="refresh"
            size={moderateScale(16)}
            color={C.turquoise}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={styles.resetLabel}>Reset to defaults</Text>
        </Pressable>
        <Text style={styles.resetNote}>
          Restores the default text size, shows your chosen theme again and
          returns motion to System. Your profile and other app data aren’t
          affected.
        </Text>
      </ScrollView>
    </ThemedView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
// No fixed heights on anything holding text: these controls have to survive
// the largest system text size.

const MUTED = "rgba(255,255,255,0.78)";

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%" },
  content: {
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(12),
  },
  intro: {
    color: "#ffffff",
    fontSize: moderateScale(15),
    lineHeight: moderateScale(22),
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: scale(6),
    marginTop: verticalScale(8),
  },
  note: {
    flex: 1,
    color: MUTED,
    fontSize: moderateScale(13),
    lineHeight: moderateScale(18),
  },
  card: {
    marginTop: verticalScale(16),
    padding: scale(16),
    borderRadius: moderateScale(16),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(20,10,45,0.55)",
  },
  sectionTitle: {
    color: MUTED,
    fontSize: moderateScale(12),
    fontWeight: "600",
    letterSpacing: 1.5,
    marginBottom: verticalScale(12),
  },
  settingTitle: {
    color: "#ffffff",
    fontSize: moderateScale(17),
    fontWeight: "600",
  },
  settingBody: {
    color: MUTED,
    fontSize: moderateScale(14),
    lineHeight: moderateScale(20),
    marginTop: verticalScale(4),
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: MIN_TARGET,
    gap: scale(12),
  },
  switchText: { flex: 1 },
  switchControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(8),
  },
  switchState: {
    color: MUTED,
    fontSize: moderateScale(14),
    fontWeight: "600",
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: scale(10),
    marginTop: verticalScale(14),
  },
  segment: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: scale(120),
    minHeight: MIN_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(12),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  segmentSelected: {
    borderWidth: 2,
    borderColor: C.turquoise,
    backgroundColor: "rgba(111,255,233,0.12)",
  },
  segmentTick: { marginRight: scale(6) },
  sizeSegment: {
    flexDirection: "column",
    minWidth: scale(90),
    paddingVertical: verticalScale(8),
  },
  sizeSample: {
    color: MUTED,
    fontWeight: "600",
  },
  sizeLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: verticalScale(2),
  },
  sizeLabel: {
    color: MUTED,
    fontSize: moderateScale(14),
    textAlign: "center",
  },
  previewCard: {
    padding: scale(16),
    borderRadius: moderateScale(14),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  previewTitle: {
    color: "#ffffff",
    fontSize: moderateScale(20),
    fontWeight: "600",
  },
  previewBody: {
    color: MUTED,
    fontSize: moderateScale(16),
    lineHeight: moderateScale(24),
    marginTop: verticalScale(8),
  },
  previewButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: scale(10),
    marginTop: verticalScale(14),
  },
  previewButton: {
    minHeight: MIN_TARGET,
    justifyContent: "center",
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(8),
    borderRadius: 999,
  },
  // Darker than C.purple, which carries white text at only ~4.2:1.
  previewButtonPrimary: { backgroundColor: "#5A3D9A" },
  previewButtonSecondary: {
    borderWidth: 1,
    borderColor: "rgba(111,255,233,0.45)",
  },
  previewButtonPrimaryLabel: {
    color: "#ffffff",
    fontSize: moderateScale(16),
    fontWeight: "600",
  },
  previewButtonSecondaryLabel: {
    color: C.turquoise,
    fontSize: moderateScale(16),
    fontWeight: "600",
  },
  segmentLabel: {
    color: MUTED,
    fontSize: moderateScale(16),
  },
  segmentLabelSelected: {
    color: "#ffffff",
    fontWeight: "700",
  },
  resetButton: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: scale(8),
    minHeight: MIN_TARGET,
    marginTop: verticalScale(28),
    paddingHorizontal: scale(22),
    paddingVertical: verticalScale(10),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(111,255,233,0.45)",
    backgroundColor: "rgba(20,10,45,0.55)",
  },
  resetButtonDisabled: { opacity: 0.5 },
  resetLabel: {
    color: C.turquoise,
    fontSize: moderateScale(16),
    fontWeight: "600",
  },
  resetNote: {
    color: MUTED,
    fontSize: moderateScale(13),
    lineHeight: moderateScale(19),
    textAlign: "center",
    marginTop: verticalScale(10),
    paddingHorizontal: scale(12),
  },
});
