// app/(supporting)/ChangeThemeScreen.tsx
import React, { useContext, useRef, useEffect } from "react";
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  ImageBackground,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { doc, setDoc } from "firebase/firestore";
import { auth } from "../../firebaseConfig";
import { db } from '../../firebaseConfig';
import { ThemeContext } from "@/src/context/theme-context";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";
import HeaderNav from "@/src/components/shared/header-nav";
import { logger } from "@/src/utils/logger";


export default function ChangeThemeScreen() {
  const { theme, setThemeKey, themes } = useContext(ThemeContext);
  const router = useRouter();
  const originalKey = useRef<string | null>(null);

  /** 🧠 Save original theme only once on mount */
  useEffect(() => {
    if (originalKey.current === null) {
      originalKey.current = theme.key;
    }
  }, []);

  /** Handle select + apply */
  const handleSelect = (key: string) => setThemeKey(key);

  const handleApply = async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        await setDoc(
          doc(db, "users", currentUser.uid),
          { themeKey: theme.key },
          { merge: true }
        );
      } catch (err) {
        logger.error("[update-theme] failed to save themeKey", err, "theme_save");
        // Used to navigate away regardless, so the theme looked applied and
        // quietly reverted on the next launch.
        Alert.alert("Couldn't save theme", "Please check your connection and try again.");
        return;
      }
    }
    router.replace("/(settings)/profile");
  };

  const handleCancel = () => {
    if (originalKey.current) setThemeKey(originalKey.current);
    router.replace("/(settings)/profile");
  };

  /** 🌈 Background helper */
  const renderBackground = (children: React.ReactNode) => {
    if (theme.backgroundType === "image" && theme.backgroundImage) {
      return (
        <ImageBackground
          source={theme.backgroundImage}
          style={styles.absoluteFill}
          resizeMode="cover"
        >
          {children}
        </ImageBackground>
      );
    }
    if (theme.backgroundType === "gradient" && theme.gradient) {
      return (
        <LinearGradient
          colors={theme.gradient.colors as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{
            x: Math.cos((theme.gradient.angle ?? 0) * Math.PI / 180),
            y: Math.sin((theme.gradient.angle ?? 0) * Math.PI / 180),
          }}
          style={styles.absoluteFill}
        >
          {children}
        </LinearGradient>
      );
    }
    return (
      <View
        style={[
          styles.absoluteFill,
          { backgroundColor: theme.colors.background },
        ]}
      >
        {children}
      </View>
    );
  };

  /** 📱 Render */
  return renderBackground(
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      {/* Dynamic StatusBar based on theme */}
      <StatusBar style={theme.isDark ? "light" : "dark"} />


      {/* Absolute Header */}
      <HeaderNav
        title="Change Color Theme"
        leftIconName="arrow-back"
        onLeftPress={handleCancel}
        // It reverts the preview — "Back" alone hid that
        leftAccessibilityLabel="Cancel"
        rightLabel="Apply"
        onRightPress={handleApply}
        backgroundColor={theme.colors.headerBg}
        textColor={theme.colors.headerText}
      />

      {/* Scrollable Theme List */}
      <FlatList
        accessibilityRole="radiogroup"
        accessibilityLabel="Color theme"
        contentContainerStyle={styles.listContent}
        data={Object.values(themes)}
        keyExtractor={(t) => t.key}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        renderItem={({ item }) => {
          const isSelected = item.key === theme.key;
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => handleSelect(item.key)}
              // Selection was only a border on the swatch
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
            >
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: item.colors.headerBg },
                  isSelected && {
                    borderWidth: 2,
                    borderColor: theme.colors.headerText,
                  },
                ]}
              />
              <Text style={[styles.label, { color: theme.colors.text }]}>
                {item.key.charAt(0).toUpperCase() + item.key.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

/* Styles */
const styles = StyleSheet.create({
  absoluteFill: { ...StyleSheet.absoluteFill },
  container: { flex: 1 },
  listContent: {
    paddingTop: verticalScale(90), // space below the header
    paddingBottom: verticalScale(50),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(14),
  },
  swatch: {
    width: scale(32),
    height: verticalScale(32),
    borderRadius: moderateScale(8),
    marginRight: scale(16),
  },
  label: {
    fontSize: moderateScale(16),
    fontWeight: "500",
  },
  divider: {
    borderBottomWidth: 1,
    marginHorizontal: scale(16),
    opacity: 0.2,
    borderColor: "rgba(255,255,255,0.3)",
  },
});
