import React, { useContext } from "react";
import {
  View,
  Text,
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

const NAV_BAR_HEIGHT = 44; // logical nav bar height (below status bar)

type HeaderNavProps = {
  title?: string;
  leftLabel?: string;
  rightLabel?: string;
  leftIconName?: React.ComponentProps<typeof Ionicons>["name"];
  rightIconName?: React.ComponentProps<typeof Ionicons>["name"];
  leftIconSource?: ImageSourcePropType;
  rightIconSource?: ImageSourcePropType;
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
      paddingHorizontal: scale(10),
    },
    sideContainer: {
      width: scale(80),
      height: navHeight,
    },
    icon: {
      width: scale(30),
      height: scale(30),
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

      <View
        style={[
          styles.headerContainer,
          { height: headerHeight, paddingTop: insets.top },
        ]}
      >
        <View style={[styles.navBar, dynamic.navBar, { height: navHeight }]}>
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
              <Text style={[styles.sideText, dynamic.sideText, { color: tc }]}>{leftLabel}</Text>
            ) : (
              <View style={dynamic.placeholder} />
            )}
          </TouchableOpacity>

          {/* TITLE */}
          <View style={styles.centerContainer} pointerEvents="none">
            <Text style={[styles.title, dynamic.title, { color: tc }]} numberOfLines={1}>
              {title}
            </Text>
          </View>

          {/* RIGHT */}
          <TouchableOpacity
            onPress={onRightPress}
            style={[styles.sideContainer, dynamic.sideContainer]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {rightIconName ? (
              <Ionicons name={rightIconName} size={moderateScale(30)} color={tc} />
            ) : rightIconSource ? (
              <Image source={rightIconSource} style={[styles.icon, dynamic.icon, { tintColor: tc }]} />
            ) : rightLabel ? (
              <Text style={[styles.sideText, dynamic.sideText, { color: tc }]}>{rightLabel}</Text>
            ) : (
              <View style={dynamic.placeholder} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

// Only static / layout values here — no scale() calls
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
  sideText: {
    fontWeight: "500",
    includeFontPadding: false,
  },
});
