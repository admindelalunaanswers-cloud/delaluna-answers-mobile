import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import React, { useContext, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { TextInput } from "@/src/components/app-text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { db } from "@/firebaseConfig";
import { GlassButton } from "@/src/assets/buttons/glass-button";
import HeaderNav from "@/src/components/shared/header-nav";
import { ThemedText } from "@/src/components/themed-text";
import { ThemedView } from "@/src/components/themed-view";
import { ThemeContext } from "@/src/context/theme-context";
import { useUser } from "@/src/context/user-context";
import { buildCompatibilityPrompt } from "@/src/prompts/compatibility-prompt";
import { calculateNatalChart, NatalChart } from "@/src/services/astroEngine";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";

import LoadingScreen from "../../(util)/loading-screen";
import { logger } from "@/src/utils/logger";
import { useAnnounce } from "@/src/hooks/use-announce";
import { deleteConnection } from "@/src/services/connection.service";
import {
  ConnectionsBirthdayField,
  ConnectionsPlaceOfBirthField,
  ConnectionsTimeOfBirthField,
  DelalunaInputRow,
  PronounsField,
  type FieldConfig,
  type PersonBirthData,
} from "@/src/components/connection/connection-fields";

const NAV_BAR_HEIGHT = 44;
const MAX_BIRTH_DETAIL_CHANGES = 3;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EditConnectionScreen() {
  const { id: connectionId } = useLocalSearchParams<{ id: string }>();
  const { theme } = useContext(ThemeContext);
  const { authUser } = useUser();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + verticalScale(NAV_BAR_HEIGHT);

  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Calculating cosmic alignment...");
  // The save replaces the form with an animation and rotating messages, otherwise silent.
  useAnnounce(saving ? loadingMessage : null);
  const [changeCount, setChangeCount] = useState(0);
  const remainingChanges = MAX_BIRTH_DETAIL_CHANGES - changeCount;
  const [originalSnapshot, setOriginalSnapshot] = useState<{
    first: PersonBirthData;
    second: PersonBirthData;
    relationshipType: string | null;
  } | null>(null);
  const [connection, setConnection] = useState<any>(null);

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
    if (!saving) return;
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % LOADING_SAYINGS.length;
      setLoadingMessage(LOADING_SAYINGS[index]);
    }, 2500);
    return () => clearInterval(interval);
  }, [saving]);

  const [firstPerson, setFirstPerson] = useState<PersonBirthData>({
    "First Name": "", "Last Name": "", Pronouns: "",
    Birthday: "", "Place of Birth": "", "Time of Birth": "",
  });
  const [secondPerson, setSecondPerson] = useState<PersonBirthData>({
    "First Name": "", "Last Name": "", Pronouns: "",
    Birthday: "", "Place of Birth": "", "Time of Birth": "",
  });
  const [relationshipType, setRelationshipType] = useState<string | null>(null);

  // Load existing connection data to pre-populate all fields
  useEffect(() => {
    if (!authUser?.uid || !connectionId) return;
    const ref = doc(db, "users", authUser.uid, "connections", connectionId);
    getDoc(ref).then((snap) => {
      if (!snap.exists()) {
        Alert.alert("Error", "Connection not found.");
        router.back();
        return;
      }
      const data = snap.data();

      const hydratePerson = (p: any): PersonBirthData => ({
        "First Name": p?.firstName ?? "",
        "Last Name": p?.lastName ?? "",
        Pronouns: p?.pronouns ?? "",
        Birthday: p?.birthday ?? "",
        "Place of Birth": p?.placeOfBirth ?? "",
        "Time of Birth": p?.timeOfBirth ?? "",
        birthLat: typeof p?.birthLat === "number" ? p.birthLat : undefined,
        birthLon: typeof p?.birthLon === "number" ? p.birthLon : undefined,
        birthTimezone: typeof p?.birthTimezone === "number" ? p.birthTimezone : undefined,
        isBirthTimeUnknown: !!p?.isBirthTimeUnknown,
        isPlaceOfBirthUnknown: !!p?.isPlaceOfBirthUnknown,
      });

      const hydratedFirst = hydratePerson(data.firstPerson);
      const hydratedSecond = hydratePerson(data.secondPerson);
      const hydratedRelationship = data.relationshipType ?? null;

      setFirstPerson(hydratedFirst);
      setSecondPerson(hydratedSecond);
      setRelationshipType(hydratedRelationship);
      setChangeCount(typeof data.birthDetailsChangeCount === "number" ? data.birthDetailsChangeCount : 0);
      setConnection(data);
      setOriginalSnapshot({
        first: hydratedFirst,
        second: hydratedSecond,
        relationshipType: hydratedRelationship,
      });
      setInitialLoading(false);
    }).catch(() => {
      Alert.alert("Error", "Failed to load connection.");
      router.back();
    });
  }, [authUser?.uid, connectionId]);

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (initialLoading) return;
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1, duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [initialLoading, theme]);

  const birthFields: FieldConfig[] = [
    { label: "First Name", type: "text", editable: true },
    { label: "Last Name", type: "text", editable: true },
    { label: "Pronouns", type: "pronouns", editable: true },
    { label: "Birthday", type: "date", placeholder: "MM/DD/YYYY", editable: remainingChanges > 0 },
    { label: "Place of Birth", type: "location", editable: remainingChanges > 0 },
    { label: "Time of Birth", type: "time", placeholder: "H:MM AM/PM", editable: remainingChanges > 0 },
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

  const isEmpty = (val: any) =>
    val == null || (typeof val === "string" && val.trim().length === 0);

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

  const birthDetailsChanged = (() => {
    if (!originalSnapshot) return false;
    const fields: (keyof PersonBirthData)[] = [
      "Birthday", "Time of Birth", "Place of Birth",
      "birthLat", "birthLon", "birthTimezone",
      "isBirthTimeUnknown", "isPlaceOfBirthUnknown",
    ] as any;
    const diff = (a: PersonBirthData, b: PersonBirthData) =>
      fields.some((f) => (a[f] ?? "") !== (b[f] ?? ""));
    return diff(firstPerson, originalSnapshot.first) || diff(secondPerson, originalSnapshot.second);
  })();

  const pronounsChanged = (() => {
    if (!originalSnapshot) return false;
    return (
      firstPerson.Pronouns !== originalSnapshot.first.Pronouns ||
      secondPerson.Pronouns !== originalSnapshot.second.Pronouns
    );
  })();

  const onlyPronounsChanged = pronounsChanged && !birthDetailsChanged;

  const replacePronouns = (text: string, oldPronoun: string, newPronoun: string): string => {
    const pronounMap: Record<string, { subject: string; object: string; possessive: string; reflexive: string }> = {
      "She/Her": { subject: "she", object: "her", possessive: "her", reflexive: "herself" },
      "He/Him": { subject: "he", object: "him", possessive: "his", reflexive: "himself" },
      "They/Them": { subject: "they", object: "them", possessive: "their", reflexive: "themselves" },
      "Non Binary": { subject: "they", object: "them", possessive: "their", reflexive: "themselves" },
    };

    const oldMap = pronounMap[oldPronoun];
    const newMap = pronounMap[newPronoun];
    if (!oldMap || !newMap) return text;

    let result = text;
    result = result.replace(new RegExp(`\\b${oldMap.subject}\\b`, "gi"), newMap.subject);
    result = result.replace(new RegExp(`\\b${oldMap.object}\\b`, "gi"), newMap.object);
    result = result.replace(new RegExp(`\\b${oldMap.possessive}\\b`, "gi"), newMap.possessive);
    result = result.replace(new RegExp(`\\b${oldMap.reflexive}\\b`, "gi"), newMap.reflexive);
    return result;
  };

  const handleSavePronouns = async () => {
    try {
      const origFirst = originalSnapshot?.first;
      const origSecond = originalSnapshot?.second;
      // Spread existing Firestore person map first so sun/moon/rising fields are preserved.
      let updatedData: any = {
        firstPerson: {
          ...(connection?.firstPerson ?? {}),
          firstName: firstPerson["First Name"],
          lastName: firstPerson["Last Name"],
          pronouns: firstPerson.Pronouns,
        },
        secondPerson: {
          ...(connection?.secondPerson ?? {}),
          firstName: secondPerson["First Name"],
          lastName: secondPerson["Last Name"],
          pronouns: secondPerson.Pronouns,
        },
      };

      if (
        origFirst?.Pronouns &&
        firstPerson.Pronouns !== origFirst.Pronouns &&
        connection?.compatibility?.advice
      ) {
        const oldAdvice = connection.compatibility.advice;
        updatedData.compatibility = {
          ...connection.compatibility,
          advice: replacePronouns(oldAdvice, origFirst.Pronouns, firstPerson.Pronouns),
        };
      }

      if (
        origSecond?.Pronouns &&
        secondPerson.Pronouns !== origSecond.Pronouns &&
        connection?.compatibility?.advice
      ) {
        const oldAdvice = updatedData.compatibility?.advice ?? connection.compatibility.advice;
        updatedData.compatibility = {
          ...connection.compatibility,
          advice: replacePronouns(oldAdvice, origSecond.Pronouns, secondPerson.Pronouns),
        };
      }

      const ref = doc(db, "users", authUser!.uid, "connections", connectionId!);
      await updateDoc(ref, updatedData);
      router.back();
    } catch (err) {
      logger.error("[connection-edit] save pronouns failed", err, "connection_save_pronouns");
      Alert.alert("Error", "Failed to save changes.");
      setSaving(false);
    }
  };

  const handleSave = async () => {
    dismissAllSuggestions();

    // Validate before showing the loading screen so we never flash LoadingScreen
    // and immediately unmount it (which can crash LottieView on rapid mount/unmount).
    if (!validatePerson(firstPerson, "First Person")) return;
    if (!validatePerson(secondPerson, "Second Person")) return;
    if (!relationshipType) {
      Alert.alert("Missing Relationship Type", "Please select a relationship type.");
      return;
    }
    if (birthDetailsChanged && changeCount >= MAX_BIRTH_DETAIL_CHANGES) {
      Alert.alert(
        "Change limit reached",
        `Connection birth details can only be updated ${MAX_BIRTH_DETAIL_CHANGES} times. Please contact support if you need further changes.`,
      );
      return;
    }

    if (onlyPronounsChanged) {
      setSaving(true);
      try {
        await handleSavePronouns();
      } catch (err) {
        logger.error("[connection-edit] save pronouns failed", err, "connection_save_pronouns");
        Alert.alert("Error", "Failed to save changes.");
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    try {
      const connectionRef = doc(db, "users", authUser!.uid, "connections", connectionId!);
      const nextChangeCount = birthDetailsChanged ? changeCount + 1 : changeCount;

      if (birthDetailsChanged) {
        // ── Recalculate charts and regenerate the compatibility report ────────
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

        const firstParams = extractBirthParams(firstPerson);
        const firstChart: NatalChart = await calculateNatalChart({
          year: firstParams.year, month: firstParams.month, day: firstParams.day,
          hour: firstParams.hour, minute: firstParams.min,
          lat: firstParams.lat, lon: firstParams.lon, timezone: firstParams.tzone,
        });

        const secondParams = extractBirthParams(secondPerson);
        const secondChart: NatalChart = await calculateNatalChart({
          year: secondParams.year, month: secondParams.month, day: secondParams.day,
          hour: secondParams.hour, minute: secondParams.min,
          lat: secondParams.lat, lon: secondParams.lon, timezone: secondParams.tzone,
        });

        const prompt = buildCompatibilityPrompt(
          JSON.stringify(firstChart),
          JSON.stringify(secondChart),
          firstPerson.Pronouns,
          secondPerson.Pronouns,
          relationshipType,
        );

        const mapPerson = (person: PersonBirthData, chart: NatalChart) => ({
          firstName: person["First Name"],
          lastName: person["Last Name"],
          pronouns: person.Pronouns,
          sun: chart.planets.find((p: any) => p.name === "Sun")?.sign ?? "",
          moon: chart.planets.find((p: any) => p.name === "Moon")?.sign ?? "",
          rising: chart.ascendant.sign,
          birthday: person.Birthday,
          timeOfBirth: person["Time of Birth"],
          placeOfBirth: person["Place of Birth"],
          birthLat: person.birthLat ?? null,
          birthLon: person.birthLon ?? null,
          birthTimezone: person.birthTimezone ?? null,
          isBirthTimeUnknown: !!person.isBirthTimeUnknown,
          isPlaceOfBirthUnknown: !!person.isPlaceOfBirthUnknown,
        });

        // Update the existing connection document in place — keeps the same ID.
        // Avoid mixing dot-notation keys with deleteField() in one updateDoc call;
        // instead use separate updateDoc calls for each concern.
        await updateDoc(connectionRef, {
          relationshipType,
          firstPerson: mapPerson(firstPerson, firstChart),
          secondPerson: mapPerson(secondPerson, secondChart),
          status: { state: "pending" },
          birthDetailsChangeCount: nextChangeCount,
          compatibility: deleteField(),
        });

        // Replace the report/details doc entirely so the GenAI extension sees a
        // fresh prompt with no stale response. setDoc (no merge) is the safest
        // way to avoid deleteField() inside setDoc with merge, which behaves
        // inconsistently across Firebase SDK versions.
        const reportDocRef = doc(db, "users", authUser!.uid, "connections", connectionId!, "report", "details");
        await setDoc(reportDocRef, {
          prompt,
          requestedAt: serverTimestamp(),
        });
      } else {
        // ── Names / relationship type only — preserve existing chart signs ────
        const mapPerson = (person: PersonBirthData, existing: any) => ({
          ...existing,
          firstName: person["First Name"],
          lastName: person["Last Name"],
          pronouns: person.Pronouns,
          birthday: person.Birthday,
          timeOfBirth: person["Time of Birth"],
          placeOfBirth: person["Place of Birth"],
          birthLat: person.birthLat ?? null,
          birthLon: person.birthLon ?? null,
          birthTimezone: person.birthTimezone ?? null,
          isBirthTimeUnknown: !!person.isBirthTimeUnknown,
          isPlaceOfBirthUnknown: !!person.isPlaceOfBirthUnknown,
        });

        await updateDoc(connectionRef, {
          relationshipType,
          firstPerson: mapPerson(firstPerson, connection?.firstPerson ?? {}),
          secondPerson: mapPerson(secondPerson, connection?.secondPerson ?? {}),
        });
      }

      router.back();
    } catch (err) {
      logger.error("[connection-edit] save failed", err, "connection_save");
      Alert.alert("Error", "Something went wrong saving this connection.");
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Connection",
      "This will permanently delete this connection and its compatibility report.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // The shared path: Cloud Function, cache, analytics — not a bare deleteDoc.
              await deleteConnection(authUser!.uid, connectionId!);
              router.replace("/(main)/connections");
            } catch (err) {
              logger.error("[connection-edit] delete failed", err, "connection_delete");
              Alert.alert("Error", "Failed to delete connection.");
            }
          },
        },
      ]
    );
  };

  const handleCancel = () => router.back();

  const sanitizeValue = (val: any): string | number | undefined =>
    typeof val === "boolean" ? "" : val;

  const sections = [
    { key: "first", title: "First Individual", fields: birthFields, onChange: setFirstPerson },
    { key: "second", title: "Second Individual", fields: birthFields, onChange: setSecondPerson },
  ];

  const relationshipOptions = ["It's Consistent", "It's Complicated", "I Dunno"];

  if (initialLoading || saving) {
    return <LoadingScreen progress={0} message={loadingMessage} />;
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <HeaderNav
        title="Edit Connection"
        rightLabel="Cancel"
        onRightPress={handleCancel}
      />
      <Animated.View style={[styles.container, { opacity: fade, marginTop: headerHeight }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          // This view starts below the header (marginTop above), so offset by
          // exactly that. insets.bottom + 40 fell ~35pt short and left Save and
          // Delete under the keyboard even scrolled to the end.
          keyboardVerticalOffset={headerHeight}
        >
          <FlatList
            ref={flatListRef}
            data={sections}
            keyExtractor={(item) => item.key}
            style={{ backgroundColor: "transparent", flex: 1 }}
            contentContainerStyle={{ paddingTop: verticalScale(5), paddingBottom: verticalScale(10) }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <ThemedView style={styles.changesBanner}>
                <Ionicons
                  name={remainingChanges === 0 ? "lock-closed-outline" : "information-circle-outline"}
                  size={moderateScale(14)}
                  color={remainingChanges === 0 ? "#FF6B6B" : "rgba(111,255,233,0.7)"}
                />
                <ThemedText
                  style={[
                    styles.changesBannerText,
                    remainingChanges === 0 && styles.changesBannerTextEmpty,
                  ]}
                >
                  {remainingChanges === 0
                    ? "No birth detail changes left"
                    : `${remainingChanges} of ${MAX_BIRTH_DETAIL_CHANGES} birth detail ${remainingChanges === 1 ? "change" : "changes"} remaining`}
                </ThemedText>
              </ThemedView>
            }
            renderItem={({ item, index }) => (
              <ThemedView style={styles.section}>
                <ThemedView style={styles.userRow}>
                  <ThemedText style={styles.titleText} accessibilityRole="header">{item.title}</ThemedText>
                </ThemedView>

                <ThemedView style={styles.divider} />

                {(() => {
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
                          editable={field.editable}
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
                          editable={field.editable}
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
                          editable={field.editable}
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
                })()}

                {item.key === "second" && (
                  <ThemedView
                    style={styles.relationshipRow}
                    accessibilityRole="radiogroup"
                    accessibilityLabel="Relationship type"
                  >
                    {relationshipOptions.map((option) => {
                      const key = option.toLowerCase();
                      const iconSource =
                        key.includes("consistent")
                          ? require("@/src/assets/connections/consistent.png")
                          : key.includes("complicated")
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
                <GlassButton title="Save Connection" onPress={handleSave} />
                <TouchableOpacity
                  onPress={handleDelete}
                  activeOpacity={0.7}
                  style={styles.deleteBtn}
                  accessibilityRole="button"
                >
                  <ThemedText style={styles.deleteBtnText}>Delete Connection</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            }
          />
        </KeyboardAvoidingView>
      </Animated.View>
    </ThemedView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    fontWeight: "600",
  },
  unknownText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: moderateScale(14),
    fontStyle: "italic",
    paddingVertical: verticalScale(4),
  },
  deleteBtn: {
    marginTop: verticalScale(4),
    paddingVertical: verticalScale(8),
  },
  deleteBtnText: {
    color: "#FF6B6B",
    fontSize: moderateScale(14),
    textAlign: "center",
  },
  skipLink: {
    color: "rgba(111,255,233,0.7)",
    fontSize: moderateScale(12),
    marginTop: verticalScale(4),
  },
  changesBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(6),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    marginHorizontal: scale(15),
    marginTop: verticalScale(8),
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: "rgba(111,255,233,0.25)",
    backgroundColor: "rgba(111,255,233,0.06)",
  },
  changesBannerText: {
    color: "rgba(111,255,233,0.85)",
    fontSize: moderateScale(12),
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  changesBannerTextEmpty: {
    color: "#FF6B6B",
  },
});
