import React, { useContext } from "react";
import {
  TouchableOpacity,
  StyleSheet,
  Image,
  ImageSourcePropType,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ThemeContext } from "@/src/context/theme-context";
import { useResponsive } from "@/src/hooks/use-responsive";
import { MAX_CONTENT_WIDTH } from "@/src/utils/layout";
import { ThemedText } from "../themed-text";
import { ThemedView } from "../themed-view";

const NAV_BAR_HEIGHT = 44;
// Header text follows the system text size up to this, then shrinks to fit the
// fixed-height bar (see the title below). ~ the largest standard Dynamic Type step.
const HEADER_MAX_FONT_SCALE = 1.5;

// Icon-only buttons have no text for VoiceOver/TalkBack to read, so every side
// button needs an explicit name. Back arrows are common enough to default.
function defaultIconLabel(name?: string): string | undefined {
  if (!name) return undefined;
  if (name.startsWith("arrow-back") || name.startsWith("chevron-back")) return "Back";
  return undefined;
}

type HeaderNavProps = {
  title?: string;
  leftLabel?: string;
  rightLabel?: string;
  leftIconName?: React.ComponentProps<typeof Ionicons>["name"];
  rightIconName?: React.ComponentProps<typeof Ionicons>["name"];
  leftIconSource?: ImageSourcePropType;
  rightIconSource?: ImageSourcePropType;
  rightAvatarSource?: ImageSourcePropType;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  /** Screen-reader name for an icon-only side button. Back icons and the avatar get a default. */
  leftAccessibilityLabel?: string;
  rightAccessibilityLabel?: string;
  /**
   * A second icon button on the right, drawn before the main one (e.g. chat's
   * Export beside New chat). Icon-only, so the label is required.
   */
  rightSecondaryIconName?: React.ComponentProps<typeof Ionicons>["name"];
  onRightSecondaryPress?: () => void;
  rightSecondaryAccessibilityLabel?: string;
  backgroundColor?: string;
  textColor?: string;
};

/** Space between the two right-hand icons when a secondary one is shown. */
export const HEADER_ICON_GAP = 14;

export default function HeaderNav({
  title,
  leftLabel,
  rightLabel,
  leftIconName,
  rightIconName,
  leftIconSource,
  rightIconSource,
  rightAvatarSource,
  onLeftPress,
  onRightPress,
  leftAccessibilityLabel,
  rightAccessibilityLabel,
  rightSecondaryIconName,
  onRightSecondaryPress,
  rightSecondaryAccessibilityLabel,
  backgroundColor,
  textColor,
}: HeaderNavProps) {
  const { theme } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();
  const { scale, moderateScale } = useResponsive();

  const bg = backgroundColor ?? theme.colors.headerBg;
  const tc = textColor ?? theme.colors.headerText;

  const leftHasContent = !!(leftIconName || leftIconSource || leftLabel);
  const rightHasContent = !!(rightAvatarSource || rightIconName || rightIconSource || rightLabel);
  const leftA11yLabel = leftAccessibilityLabel ?? leftLabel ?? defaultIconLabel(leftIconName);
  const rightA11yLabel =
    rightAccessibilityLabel ?? rightLabel ?? (rightAvatarSource ? "Profile" : defaultIconLabel(rightIconName));

  const headerHeight = insets.top + scale(NAV_BAR_HEIGHT);
  const navHeight = scale(NAV_BAR_HEIGHT);

  const dynamic = {
    navBar: {
      paddingHorizontal: scale(5),
    },
    sideContainer: {
      width: scale(80),
      height: navHeight,
    },
    icon: {
      width: scale(30),
      height: scale(30),
    },
    avatarIcon: {
      width: scale(40),
      height: scale(40),
    },
    placeholder: {
      width: scale(24),
      height: scale(24),
    },
    title: {
      fontSize: moderateScale(18),
    },
    sideText: {
      fontSize: moderateScale(15),
    },
  };

  return (
    <>
      <StatusBar style={theme.isDark ? "light" : "dark"} />

      <ThemedView
        style={[
          styles.headerContainer,
          { height: headerHeight, paddingTop: insets.top },
        ]}
      >
        <ThemedView style={[styles.navBar, dynamic.navBar, { height: navHeight }]}>
          {/* LEFT */}
          <TouchableOpacity
            onPress={onLeftPress}
            style={[styles.sideContainer, dynamic.sideContainer]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            // An empty slot is layout only — keep it out of the screen-reader order.
            accessible={leftHasContent}
            accessibilityRole="button"
            accessibilityLabel={leftA11yLabel}
            importantForAccessibility={leftHasContent ? "yes" : "no-hide-descendants"}
          >
            {leftIconName ? (
              <Ionicons name={leftIconName} size={moderateScale(30)} color={tc} />
            ) : leftIconSource ? (
              <Image source={leftIconSource} style={[styles.icon, dynamic.icon, { tintColor: tc }]} />
            ) : leftLabel ? (
              <ThemedText
                style={[styles.sideText, dynamic.sideText, { color: tc }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE}
              >
                {leftLabel}
              </ThemedText>
            ) : (
              <ThemedView style={dynamic.placeholder} />
            )}
          </TouchableOpacity>

          {/* TITLE */}
          <ThemedView style={styles.centerContainer} pointerEvents="none">
            {/* The bar is a fixed height on purpose — it is absolutely positioned
                and ~13 screens pad their content by insets.top + scale(44), so a
                bar that grew would cover their first lines. So the text fits the
                bar instead, as a native nav bar's does: it scales with the
                system setting up to a cap, then shrinks to fit rather than
                truncating. Screen readers still get the full title. */}
            <ThemedText
              style={[styles.title, dynamic.title, { color: tc }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE}
              accessibilityRole="header"
            >
              {title}
            </ThemedText>
          </ThemedView>

          {/* RIGHT */}
          <ThemedView style={[styles.sideContainer, styles.rightGroup, dynamic.sideContainer]}>
            {rightSecondaryIconName ? (
              <TouchableOpacity
                onPress={onRightSecondaryPress}
                style={{ marginRight: HEADER_ICON_GAP }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={rightSecondaryAccessibilityLabel}
              >
                <Ionicons name={rightSecondaryIconName} size={moderateScale(30)} color={tc} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={onRightPress}
              style={[
                styles.sideContainer,
                styles.rightContainer,
                rightSecondaryIconName ? { height: dynamic.sideContainer.height } : dynamic.sideContainer,
              ]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessible={rightHasContent}
              accessibilityRole="button"
              accessibilityLabel={rightA11yLabel}
              importantForAccessibility={rightHasContent ? "yes" : "no-hide-descendants"}
            >
              {rightAvatarSource ? (
                <Image source={rightAvatarSource} style={[styles.avatar, dynamic.avatarIcon]} />
              ) : rightIconName ? (
                <Ionicons name={rightIconName} size={moderateScale(30)} color={tc} />
              ) : rightIconSource ? (
                <Image source={rightIconSource} style={[styles.icon, dynamic.icon, { tintColor: tc }]} />
              ) : rightLabel ? (
                <ThemedText
                  style={[styles.sideText, dynamic.sideText, { color: tc }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE}
                >
                  {rightLabel}
                </ThemedText>
              ) : (
                <ThemedView style={dynamic.placeholder} />
              )}
            </TouchableOpacity>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    width: "100%",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: 2,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    // Prevent the nav content from spreading to iPad edges — keep it phone-width centered
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  sideContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  rightGroup: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  rightContainer: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  centerContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    textAlign: "center",
    fontWeight: Platform.select({ ios: "700", android: "600" }),
    includeFontPadding: false,
    textAlignVertical: "center",
    letterSpacing: 0.2,
  },
  icon: {
    resizeMode: "contain",
  },
  avatar: {
    borderRadius: 999,
    overflow: "hidden",
  },
  sideText: {
    fontWeight: "500",
    includeFontPadding: false,
  },
});
