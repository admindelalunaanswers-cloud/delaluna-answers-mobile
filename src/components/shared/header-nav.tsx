import React, { useContext } from "react";
import {
  TouchableOpacity,
  StyleSheet,
  Image,
  ImageSourcePropType,
  Platform,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ThemeContext } from "@/src/context/theme-context";
import { useResponsive } from "@/src/hooks/use-responsive";
import { ThemedText } from "../themed-text";
import { ThemedView } from "../themed-view";

const NAV_BAR_HEIGHT = 44;

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
  backgroundColor?: string;
  textColor?: string;
};

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
  backgroundColor,
  textColor,
}: HeaderNavProps) {
  const { theme } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();
  const { scale, moderateScale } = useResponsive();

  const bg = backgroundColor ?? theme.colors.headerBg;
  const tc = textColor ?? theme.colors.headerText;

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
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        translucent
        backgroundColor="transparent"
      />

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
          >
            {leftIconName ? (
              <Ionicons name={leftIconName} size={moderateScale(30)} color={tc} />
            ) : leftIconSource ? (
              <Image source={leftIconSource} style={[styles.icon, dynamic.icon, { tintColor: tc }]} />
            ) : leftLabel ? (
              <ThemedText style={[styles.sideText, dynamic.sideText, { color: tc }]}>{leftLabel}</ThemedText>
            ) : (
              <ThemedView style={dynamic.placeholder} />
            )}
          </TouchableOpacity>

          {/* TITLE */}
          <ThemedView style={styles.centerContainer} pointerEvents="none">
            <ThemedText style={[styles.title, dynamic.title, { color: tc }]} numberOfLines={1}>
              {title}
            </ThemedText>
          </ThemedView>

          {/* RIGHT */}
          <TouchableOpacity
            onPress={onRightPress}
            style={[styles.sideContainer, styles.rightContainer, dynamic.sideContainer]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {rightAvatarSource ? (
              <Image source={rightAvatarSource} style={[styles.avatar, dynamic.avatarIcon]} />
            ) : rightIconName ? (
              <Ionicons name={rightIconName} size={moderateScale(30)} color={tc} />
            ) : rightIconSource ? (
              <Image source={rightIconSource} style={[styles.icon, dynamic.icon, { tintColor: tc }]} />
            ) : rightLabel ? (
              <ThemedText style={[styles.sideText, dynamic.sideText, { color: tc }]}>{rightLabel}</ThemedText>
            ) : (
              <ThemedView style={dynamic.placeholder} />
            )}
          </TouchableOpacity>
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
  },
  sideContainer: {
    alignItems: "center",
    justifyContent: "center",
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
