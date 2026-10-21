import React, { useContext, useEffect, useRef, useState } from "react";

import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { router } from "expo-router";

import { httpsCallable } from "firebase/functions";
import LottieView from "lottie-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { functions } from "@/firebaseConfig";
import { GlassButton } from "@/src/assets/buttons/glass-button";
import HeaderNav from "@/src/components/shared/header-nav";
import HomeSignsDisplay from "@/src/components/shared/signs-display.component";
import { ThemedView } from "@/src/components/themed-view";
import { useHoroscope } from "@/src/context/horoscope-context";
import { ThemeContext } from "@/src/context/theme-context";
import { useUser } from "@/src/context/user-context";
import { calculateNatalChart, NatalChart } from "@/src/services/astroEngine";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";

import { ThemedText } from "@/src/components/themed-text";
import { C } from "@/src/constants/theme";
import { buildCompatibilityPrompt } from "@/src/prompts/compatibility-prompt";
import { Events } from "@/src/services/analytics.service";
import { measure } from "@/src/services/performance.service";
import { recordError } from "@/src/services/crashlytics.service";
import { logger } from "@/src/utils/logger";
import { useAnnounce } from "@/src/hooks/use-announce";
import {
  ConnectionsBirthdayField,
  ConnectionsPlaceOfBirthField,
  ConnectionsTimeOfBirthField,
  DelalunaInputRow,
  DelalunaToggle,
  PronounsField,
  type FieldConfig,
  type FieldType,
  type PersonBirthData,
} from "@/src/components/connection/connection-fields";

const NAV_BAR_HEIGHT = 44;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SingleConnectionCreateScreen() {
  const { theme } = useContext(ThemeContext);
  const { authUser, userDoc } = useUser();
  const { chartDetails } = useHoroscope();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + verticalScale(NAV_BAR_HEIGHT);
  const footHeight = verticalScale(10);
  const [isMe, setIsMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Calculating cosmic alignment...");
  // The save replaces the form with an animation and rotating messages, otherwise silent.
  useAnnounce(loading ? loadingMessage : null);

  const LOADING_SAYINGS = [
    "Calculating cosmic alignment...",
    "Reading the stars...",
    "Consulting the planets...",
    "Aligning your birth charts...",
    "Channeling celestial energy...",
    "Mapping planetary positions...",
    "Decoding your connection...",
    "Syncing with the universe...",
  ];

  useEffect(() => {
    if (!loading) return;
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % LOADING_SAYINGS.length;
      setLoadingMessage(LOADING_SAYINGS[index]);
    }, 2500);
    return () => clearInterval(interval);
  }, [loading]);

  const [firstPerson, setFirstPerson] = useState<PersonBirthData>({
    "First Name": "", "Last Name": "", Pronouns: "",
    Birthday: "", "Place of Birth": "", "Time of Birth": "",
  });

  const [secondPerson, setSecondPerson] = useState<PersonBirthData>({
    "First Name": "", "Last Name": "", Pronouns: "",
    Birthday: "", "Place of Birth": "", "Time of Birth": "",
  });

  const birthFields: FieldConfig[] = [
    { label: "First Name", type: "text" },
    { label: "Last Name", type: "text" },
    { label: "Pronouns", type: "pronouns", placeholder: "Select Pronouns" },
    { label: "Birthday", type: "date", placeholder: "MM/DD/YYYY" },
    { label: "Place of Birth", type: "location" },
    { label: "Time of Birth", type: "time", placeholder: "Select time" },
  ];

  type PersonKey = "first" | "second";

  const flatListRef = useRef<FlatList>(null);
  const firstNameRef = useRef<TextInput>(null);
  const firstLastNameRef = useRef<TextInput>(null);
  const firstLocationRef = useRef<{ dismissSuggestions: () => void; focus: () => void }>(null);
  const secondNameRef = useRef<TextInput>(null);
  const secondLastNameRef = useRef<TextInput>(null);
  const secondLocationRef = useRef<{ dismissSuggestions: () => void; focus: () => void }>(null);

  const dismissAllSuggestions = () => {
    firstLocationRef.current?.dismissSuggestions();
    secondLocationRef.current?.dismissSuggestions();
  };

  const [relationshipType, setRelationshipType] = useState<string | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1, duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [theme]);

  const focusableOrder: Record<PersonKey, string[]> = {
    first: ["First Name", "Last Name", "Pronouns"],
    second: ["First Name", "Last Name", "Pronouns"],
  };

  const getRefs = (personKey: PersonKey) =>
    personKey === "first"
      ? { firstName: firstNameRef, lastName: firstLastNameRef, placeOfBirth: firstLocationRef }
      : { firstName: secondNameRef, lastName: secondLastNameRef, placeOfBirth: secondLocationRef };

  const focusField = (personKey: PersonKey, label: string) => {
    if (label !== "Place of Birth") dismissAllSuggestions();
    const refs = getRefs(personKey);
    switch (label) {
      case "First Name": refs.firstName.current?.focus(); break;
      case "Last Name": refs.lastName.current?.focus(); break;
      case "Pronouns": Keyboard.dismiss(); break;
      case "Place of Birth": refs.placeOfBirth.current?.focus(); break;
    }
  };

  const getNextFocusableLabel = (personKey: PersonKey, label: string) => {
    const order = focusableOrder[personKey];
    const idx = order.indexOf(label);
    return idx === -1 ? null : order[idx + 1] || null;
  };

  const handleSubmitEditing = (personKey: PersonKey, label: string) => {
    const next = getNextFocusableLabel(personKey, label);
    if (next) focusField(personKey, next);
    else Keyboard.dismiss();
  };

  const sanitizeValue = (val: any): string | number | undefined =>
    typeof val === "boolean" ? "" : val;

  const firstFields: FieldConfig[] = isMe
    ? Object.keys(firstPerson).map((label) => ({
      label, type: "text" as FieldType,
      value: sanitizeValue(firstPerson[label as keyof PersonBirthData]),
      editable: false,
    }))
    : birthFields;

  const sections = [
    { key: "first", title: "First Individual", toggle: true, fields: firstFields, onChange: setFirstPerson },
    { key: "second", title: "Second Individual", toggle: false, fields: birthFields, onChange: setSecondPerson },
  ];

  const relationshipOptions = ["It's Consistent", "It's Complicated", "I Dunno"];

  const isEmpty = (val: any) =>
    val == null || (typeof val === "string" && val.trim().length === 0);

  const personHasData = (person: PersonBirthData) =>
    Object.values(person).some((val) => val != null && String(val).trim() !== "");

  const handleCancel = () => {
    const hasFirstData = personHasData(firstPerson);
    const hasSecondData = personHasData(secondPerson);
    if ((isMe && !hasSecondData) || (!isMe && !hasFirstData && !hasSecondData)) {
      router.replace("/(main)/connections");
    } else {
      Alert.alert(
        "Discard Changes?",
        "You have unsaved changes. Are you sure you want to leave?",
        [
          { text: "Keep Editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => router.replace("/(main)/connections") },
        ]
      );
    }
  };

  const validatePerson = (person: PersonBirthData, label: string) => {
    const required: (keyof PersonBirthData)[] = [
      "First Name", "Last Name", "Pronouns", "Birthday", "Place of Birth", "Time of Birth",
    ];
    const missing = required.filter((f) => {
      if (f === "Time of Birth" && person.isBirthTimeUnknown) return false;
      if (f === "Place of Birth" && person.isPlaceOfBirthUnknown) return false;
      return isEmpty(person[f]);
    });
    if (missing.length > 0) {
      // Focus returns to the first missing field we can focus, once dismissed.
      const refs: Record<string, { current: { focus: () => void } | null }> =
        label === "First Person"
          ? { "First Name": firstNameRef, "Last Name": firstLastNameRef, "Place of Birth": firstLocationRef }
          : { "First Name": secondNameRef, "Last Name": secondLastNameRef, "Place of Birth": secondLocationRef };
      const target = refs[missing[0]];
      Alert.alert(
        "Missing Information",
        `${label}: please enter ${missing.join(", ")}.`,
        target ? [{ text: "OK", onPress: () => target.current?.focus() }] : undefined,
      );
      return false;
    }
    return true;
  };

  const handleSaveConnection = async () => {
    dismissAllSuggestions();
    setLoading(true);

    
    try {
      if (!isMe && !validatePerson(firstPerson, "First Person")) { setLoading(false); return; }
      if (!validatePerson(secondPerson, "Second Person")) { setLoading(false); return; }
      if (!relationshipType) {
        Alert.alert("Missing Relationship Type", "Please select a relationship type.");
        setLoading(false);
        return;
      }

      const extractBirthParams = (person: PersonBirthData) => {
        if (!person.Birthday) throw new Error("Birthday is missing");
        if (!person["Time of Birth"] && !person.isBirthTimeUnknown) throw new Error("Time of Birth is missing");

        const { birthLat, birthLon, birthTimezone } = person;
        if (!person.isPlaceOfBirthUnknown && (birthLat == null || birthLon == null)) {
          throw new Error("Please select a location from the search results.");
        }
        const lat = birthLat ?? 0;
        const lon = birthLon ?? 0;

        const [month, day, year] = person.Birthday.split("/").map(Number);

        let hour = 0, min = 0;
        const match = person["Time of Birth"].trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (match) {
          let h = Number(match[1]);
          min = Number(match[2]);
          const period = match[3].toUpperCase();
          if (period === "PM" && h !== 12) h += 12;
          if (period === "AM" && h === 12) h = 0;
          hour = h;
        } else {
          const parts = person["Time of Birth"].split(":");
          hour = Number(parts[0]) || 0;
          min = Number(parts[1]) || 0;
        }

        const tzone = birthTimezone ?? 0;

        return { day, month, year, hour, min, lat, lon, tzone };
      };

      let enrichedFirst: any;
      let userNatalChart: any;
      let firstChart: NatalChart;
      if (isMe) {
        const bdayStr = userDoc?.birthday ?? "";
        enrichedFirst = {
          "First Name": userDoc?.firstName ?? "",
          "Last Name": userDoc?.lastName ?? "",
          Pronouns: userDoc?.pronouns ?? "",
          "Sun Sign": chartDetails?.planets.find(p => p.name === 'Sun')?.sign ?? '',
          "Moon Sign": chartDetails?.planets.find(p => p.name === 'Moon')?.sign ?? '',
          "Rising Sign": chartDetails?.ascendant.sign ?? '',
          Birthday: bdayStr,
          birthtime: userDoc?.birthtime ?? "",
          placeOfBirth: userDoc?.placeOfBirth ?? "",
          birthLat: userDoc?.birthLat ?? null,
          birthLon: userDoc?.birthLon ?? null,
          birthTimezone: userDoc?.birthTimezone ?? null,
          isBirthTimeUnknown: userDoc?.isBirthTimeUnknown ?? false,
          isPlaceOfBirthUnknown: userDoc?.isPlaceOfBirthUnknown ?? false,
        };
        userNatalChart = chartDetails ?? null;
      } else {
        const firstBirthParams = extractBirthParams(firstPerson);
        userNatalChart = await calculateNatalChart({
          year: firstBirthParams.year, month: firstBirthParams.month, day: firstBirthParams.day,
          hour: firstBirthParams.hour, minute: firstBirthParams.min,
          lat: firstBirthParams.lat, lon: firstBirthParams.lon, timezone: firstBirthParams.tzone,
        });
        enrichedFirst = {
          ...firstPerson,
          "Sun Sign": userNatalChart?.planets.find((p: any) => p.name === "Sun")?.sign ?? "",
          "Moon Sign": userNatalChart?.planets.find((p: any) => p.name === "Moon")?.sign ?? "",
          "Rising Sign": userNatalChart?.ascendant.sign,
          userName: `${firstPerson["First Name"]} ${firstPerson["Last Name"]}`,
        };
      }

      const secondBirthParams = extractBirthParams(secondPerson);
      const secondChart = await calculateNatalChart({
        year: secondBirthParams.year, month: secondBirthParams.month, day: secondBirthParams.day,
        hour: secondBirthParams.hour, minute: secondBirthParams.min,
        lat: secondBirthParams.lat, lon: secondBirthParams.lon, timezone: secondBirthParams.tzone,
      });
      const enrichedSecond = {
        ...secondPerson,
        "Sun Sign": secondChart.planets.find((p: any) => p.name === "Sun")?.sign ?? "",
        "Moon Sign": secondChart.planets.find((p: any) => p.name === "Moon")?.sign ?? "",
        "Rising Sign": secondChart.ascendant.sign,
      };

      const userPronouns = isMe ? (userDoc?.pronouns ?? "") : firstPerson.Pronouns;
      const partnerPronouns = secondPerson.Pronouns;
      const prompt = buildCompatibilityPrompt(
        JSON.stringify(userNatalChart),
        JSON.stringify(secondChart),
        userPronouns,
        partnerPronouns,
        relationshipType!,
      );

      const createConnectionFn = httpsCallable(functions, 'createConnection');
      const result = await measure(
        'connection_create',
        () => createConnectionFn({
          userId: authUser!.uid,
          isMe,
          relationshipType: relationshipType!,
          firstPerson: enrichedFirst,
          secondPerson: enrichedSecond,
          prompt,
        }) as Promise<{ data: { connectionId: string } }>,
        { attributes: { is_me: String(isMe) } },
      );

      Events.connectionCreated();

      router.replace({
        pathname: "/connection/[id]",
        params: {
          id: result.data.connectionId,
          firstFirst: enrichedFirst["First Name"] ?? "",
          firstLast: enrichedFirst["Last Name"] ?? "",
          secondFirst: enrichedSecond["First Name"] ?? "",
          secondLast: enrichedSecond["Last Name"] ?? "",
        },
      });
      return;
    } catch (err) {
      logger.error("[connection-new] save failed", err, "connection_create");
      recordError(err, 'connection_create');
      dismissAllSuggestions();
      Keyboard.dismiss();
      Alert.alert("Error", "Something went wrong creating this connection.");
    }

    setLoading(false);
  };

  const userFullName =
    userDoc?.fullName ||
    [userDoc?.firstName, userDoc?.lastName].filter(Boolean).join(" ") ||
    undefined;

  if (loading) {
    return (
      <ImageBackground source={theme.backgroundImage} style={styles.loadingContainer}>
        <View style={styles.pendingWrapper}>
          <LottieView
            source={require("@/src/assets/animations/splash-loop.json")}
            autoPlay
            loop
            style={styles.pendingAnimation}
          />
          <Text style={styles.pendingText}>{loadingMessage}</Text>
        </View>
      </ImageBackground>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <HeaderNav
        title="New Connection"
        rightLabel="Cancel"
        onRightPress={handleCancel}
      />
      <Animated.View style={[styles.container, { opacity: fade, marginTop: headerHeight }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          keyboardVerticalOffset={insets.bottom + 40}
        >
          <FlatList
            ref={flatListRef}
            data={sections}
            keyExtractor={(item) => item.key}
            style={{ backgroundColor: "transparent", flex: 1 }}
            contentContainerStyle={{ paddingTop: verticalScale(5), paddingBottom: verticalScale(10) }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => (
              <ThemedView style={styles.section}>
                <ThemedView style={styles.userRow}>
                  <ThemedText style={styles.titleText} accessibilityRole="header">{item.title}</ThemedText>
                  {item.toggle && <DelalunaToggle label="Use my chart" value={isMe} onToggle={setIsMe} />}
                </ThemedView>

                <ThemedView style={styles.divider} />

                {item.key === "first" && isMe ? (
                  <ThemedView style={styles.meCard}>
                    <ThemedText style={styles.meName}>
                      {userFullName}
                    </ThemedText>
                    <HomeSignsDisplay
                      sun={chartDetails?.planets.find(p => p.name === 'Sun')?.sign ?? ''}
                      moon={chartDetails?.moon.sign ?? ''}
                      rising={chartDetails?.ascendant.sign ?? ''}
                      showViewChart={false}
                    />
                  </ThemedView>
                ) : (
                  (() => {
                    const personKey = item.key as PersonKey;
                    const scrollToSection = () => flatListRef.current?.scrollToIndex({ index, animated: true });
                    return item.fields.map((field: FieldConfig) => {
                      const value = sanitizeValue(
                        personKey === "first"
                          ? firstPerson[field.label as keyof PersonBirthData]
                          : secondPerson[field.label as keyof PersonBirthData]
                      );
                      const inputRef =
                        field.label === "First Name"
                          ? personKey === "first" ? firstNameRef : secondNameRef
                          : field.label === "Last Name"
                            ? personKey === "first" ? firstLastNameRef : secondLastNameRef
                            : undefined;
                      const nextExists = field.type === "text" && !!getNextFocusableLabel(personKey, field.label);
                      const returnKeyType = field.type === "text" ? (nextExists ? "next" : "done") : undefined;
                      const onSubmitEditing = field.type === "text" ? () => handleSubmitEditing(personKey, field.label) : undefined;

                      if (field.label === "Pronouns") {
                        return (
                          <PronounsField
                            key={field.label}
                            person={item.title}
                            value={personKey === "first" ? firstPerson.Pronouns : secondPerson.Pronouns}
                            onChange={(vals) => item.onChange((prev: PersonBirthData) => ({ ...prev, ...vals }))}
                          />
                        );
                      }

                      if (field.label === "Birthday") {
                        return (
                          <ConnectionsBirthdayField
                            key={field.label}
                            person={item.title}
                            value={personKey === "first" ? firstPerson.Birthday : secondPerson.Birthday}
                            onChange={(vals) => item.onChange((prev: PersonBirthData) => ({ ...prev, ...vals }))}
                          />
                        );
                      }

                      if (field.label === "Place of Birth") {
                        const person = personKey === "first" ? firstPerson : secondPerson;
                        return (
                          <ConnectionsPlaceOfBirthField
                            key={field.label}
                            person={item.title}
                            value={person["Place of Birth"] ?? ""}
                            birthday={person.Birthday}
                            isUnknown={person.isPlaceOfBirthUnknown}
                            onChange={(vals) => item.onChange((prev: PersonBirthData) => ({ ...prev, ...vals }))}
                            ref={personKey === "first" ? firstLocationRef : secondLocationRef}
                            onRequestDismiss={dismissAllSuggestions}
                          />
                        );
                      }

                      if (field.label === "Time of Birth") {
                        const person = personKey === "first" ? firstPerson : secondPerson;
                        return (
                          <ConnectionsTimeOfBirthField
                            key={field.label}
                            person={item.title}
                            value={person["Time of Birth"]}
                            isUnknown={person.isBirthTimeUnknown}
                            onChange={(vals) => item.onChange((prev: PersonBirthData) => ({ ...prev, ...vals }))}
                          />
                        );
                      }

                      return (
                        <DelalunaInputRow
                          key={field.label}
                          person={item.title}
                          fields={[{ ...field, value, inputRef, returnKeyType, blurOnSubmit: field.type === "text" ? false : undefined, onSubmitEditing, onFocus: scrollToSection }]}
                          onChange={(vals) => item.onChange((prev: PersonBirthData) => ({ ...prev, ...vals }))}
                        />
                      );
                    });
                  })()
                )}

                {item.key === "second" && (
                  <ThemedView
                    style={styles.relationshipRow}
                    accessibilityRole="radiogroup"
                    accessibilityLabel="Relationship type"
                  >
                    {relationshipOptions.map((option) => {
                      const key = option.toLowerCase();
                      const iconSource =
                        key.toLowerCase().includes("consistent")
                          ? require("@/src/assets/connections/consistent.png")
                          : key.toLowerCase().includes("complicated")
                            ? require("@/src/assets/connections/complicated.png")
                            : require("@/src/assets/connections/dunno.png");
                            
                      return (
                        
                        <TouchableOpacity
                          key={option}
                          style={[styles.relationshipButton, relationshipType === option && styles.relationshipSelected]}
                          onPress={() => { dismissAllSuggestions(); setRelationshipType(option); }}
                          activeOpacity={0.8}
                          // Image-only: the option names existed only in code, and this
                          // field is required to save — a screen-reader user couldn't finish
                          accessibilityRole="radio"
                          accessibilityLabel={option}
                          accessibilityState={{ checked: relationshipType === option }}
                        >
                          <Image
                            source={iconSource}
                            style={[styles.relationshipIcon, relationshipType === option && styles.relationshipIconSelected]}
                            resizeMode="contain"
                          />
                        </TouchableOpacity>
                        
                      );
                    })}
                  </ThemedView>
                )}
              </ThemedView>
            )}
            ListFooterComponent={
              <ThemedView style={styles.footerSections}>
                <GlassButton title="View Connection" onPress={handleSaveConnection} />
              </ThemedView>
            }
          />
        </KeyboardAvoidingView>
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  loadingContainer: {
    flex: 1,
  },
  pendingWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: verticalScale(12),
  },
  pendingAnimation: {
    width: moderateScale(450),
    height: moderateScale(450),
  },
  pendingText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: moderateScale(14),
    textAlign: "center",
    paddingHorizontal: scale(24),
  },
  section: {
    width: "100%",
    paddingHorizontal: scale(10),
    paddingTop: verticalScale(15),
    paddingBottom: verticalScale(20),
    marginBottom: verticalScale(10),
    backgroundColor: "transparent",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleText: {
    color: "#FFFFFF",
    fontSize: moderateScale(18),
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginTop: verticalScale(5),
    marginBottom: verticalScale(16),
  },
  meCard: {
    borderRadius: scale(10),
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    gap: verticalScale(10),
    padding: scale(15),
  },
  meName: {
    color: C.white,
    fontSize: moderateScale(20),
    fontWeight: "700",
  },
  relationshipRow: {
    flexDirection: "row",
    marginTop: verticalScale(5),
  },
  relationshipButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: scale(10),
    marginHorizontal: scale(5),
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: verticalScale(2),
  },
  relationshipSelected: {
    backgroundColor: "rgba(142,68,173,0.7)",
    borderColor: "#FFFFFF",
  },
  relationshipIcon: {
    width: scale(75),
    height: scale(75),
    opacity: 0.8,
    tintColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  relationshipIconSelected: {
    opacity: 1,
    tintColor: "#FFFFFF",
  },
  footerSections: {
    paddingBottom: verticalScale(35),
    alignItems: "center",
    gap: verticalScale(10),
  },
  pronounBtn: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    borderRadius: scale(20),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
  },
  pronounBtnSelected: {
    backgroundColor: "rgba(142,68,173,0.7)",
    borderColor: "#FFFFFF",
  },
  pronounTxt: {
    color: "rgba(255,255,255,0.7)",
    fontSize: moderateScale(13),
  },
  pronounTxtSelected: {
    color: "#FFFFFF",
    fontWeight: "600" as const,
  },
  skipLink: {
    color: "#6FFFE9",
    fontSize: moderateScale(12),
    textDecorationLine: "underline" as const,
    marginTop: verticalScale(6),
    alignSelf: "flex-end" as const,
  },
  unknownText: {
    color: "#ffffff",
    fontSize: moderateScale(14),
    paddingVertical: verticalScale(6),
    fontStyle: "italic" as const,
  },
  unknownLink: {
    color: "#6FFFE9",
    fontSize: moderateScale(12),
    textDecorationLine: "underline" as const,
    marginTop: verticalScale(2),
    alignSelf: "flex-end" as const,
  },
});
