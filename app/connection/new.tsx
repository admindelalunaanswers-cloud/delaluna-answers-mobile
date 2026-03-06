import React, { useContext, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  TextInput,
  Switch,
  Keyboard,
} from "react-native";
import { router } from "expo-router";
import { httpsCallable } from "firebase/functions";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemeContext } from "@/src/context/theme-context";
import { useUser } from "@/src/context/user-context";
import { useHoroscope } from "@/src/context/horoscope-context";
import { functions } from "@/firebaseConfig";
import { verticalScale, scale, moderateScale } from "@/src/utils/responsive";
import HeaderNav from "@/src/components/shared/header-nav";
import HomeSignsDisplay from "@/src/components/shared/signs-display.component";
import LoadingScreen from "../(util)/loading-screen";
import { GlassButton } from "@/src/assets/buttons/glass-button";
import { calculateNatalChart } from "@/src/services/astroEngine";

const NAV_BAR_HEIGHT = 44;

// ─── Local types ──────────────────────────────────────────────────────────────

type PersonBirthData = {
  "First Name": string;
  "Last Name": string;
  Pronouns: string;
  Birthday: string;
  "Place of Birth": string;
  "Time of Birth": string;
  birthLat?: number;
  birthLon?: number;
  birthTimezone?: string; // IANA timezone string, populated by PlaceOfBirth field
};

type PersonBirthUpdate = Partial<PersonBirthData>;

type FieldType = "text" | "pronouns" | "date" | "location" | "time";

type FieldConfig = {
  label: string;
  type: FieldType;
  placeholder?: string;
  value?: string | number;
  editable?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  returnKeyType?: "next" | "done";
  blurOnSubmit?: boolean;
  onSubmitEditing?: () => void;
};

// ─── Local utilities ──────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ─── Local services ───────────────────────────────────────────────────────────

async function getAstroSigns(params: {
  day: number; month: number; year: number;
  hour: number; min: number; lat: number; lon: number; tzone: number;
}) {
  const chart = await calculateNatalChart({
    year: params.year, month: params.month, day: params.day,
    hour: params.hour, minute: params.min,
    lat: params.lat, lon: params.lon, timezone: params.tzone,
  });
  return {
    sunSign: chart.planets.find((p) => p.name === "Sun")?.sign ?? "",
    moonSign: chart.moon.sign,
    risingSign: chart.ascendant.sign,
  };
}

async function createConnection(payload: {
  userId: string; isMe: boolean; relationshipType: string;
  firstPerson: any; secondPerson: any;
}): Promise<{ connectionId: string }> {
  const fn = httpsCallable(functions, "createConnection");
  const result = await fn(payload);
  return result.data as { connectionId: string };
}

// ─── Stub components (TODO: extract into dedicated files) ─────────────────────

function DelalunaToggle({
  label, value, onToggle,
}: { label: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ color: "#FFFFFF", fontSize: moderateScale(14) }}>{label}</Text>
      <Switch value={value} onValueChange={onToggle} />
    </View>
  );
}

function DelalunaInputRow({
  fields, onChange,
}: { fields: FieldConfig[]; onChange: (vals: PersonBirthUpdate) => void }) {
  return (
    <>
      {fields.map((field) => (
        <View key={field.label} style={{ marginBottom: verticalScale(8) }}>
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: moderateScale(11), marginBottom: 4 }}>
            {field.label.toUpperCase()}
          </Text>
          <TextInput
            ref={field.inputRef}
            style={{
              color: "#FFFFFF",
              borderBottomWidth: 1,
              borderBottomColor: "rgba(255,255,255,0.3)",
              paddingVertical: verticalScale(6),
              fontSize: moderateScale(15),
            }}
            placeholder={field.placeholder}
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={typeof field.value === "string" ? field.value : ""}
            editable={field.editable !== false}
            returnKeyType={field.returnKeyType}
            submitBehavior={field.blurOnSubmit === false ? "newline" : "blurAndSubmit"}
            onSubmitEditing={field.onSubmitEditing}
            onChangeText={(text) => onChange({ [field.label]: text } as PersonBirthUpdate)}
          />
        </View>
      ))}
    </>
  );
}

const ConnectionsPlaceOfBirthField = React.forwardRef<
  { dismissSuggestions: () => void; focus: () => void },
  {
    value: string;
    onChange: (vals: PersonBirthUpdate) => void;
    onRequestDismiss?: () => void;
    returnKeyType?: "next" | "done";
    blurOnSubmit?: boolean;
    onSubmitEditing?: () => void;
  }
>(({ value, onChange, returnKeyType, blurOnSubmit, onSubmitEditing }, ref) => {
  const inputRef = useRef<TextInput>(null);
  React.useImperativeHandle(ref, () => ({
    dismissSuggestions: () => {},
    focus: () => inputRef.current?.focus(),
  }));
  return (
    <View style={{ marginBottom: verticalScale(8) }}>
      <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: moderateScale(11), marginBottom: 4 }}>
        PLACE OF BIRTH
      </Text>
      <TextInput
        ref={inputRef}
        style={{
          color: "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.3)",
          paddingVertical: verticalScale(6),
          fontSize: moderateScale(15),
        }}
        placeholder="City, Country"
        placeholderTextColor="rgba(255,255,255,0.4)"
        value={value}
        returnKeyType={returnKeyType}
        submitBehavior={blurOnSubmit === false ? "newline" : "blurAndSubmit"}
        onSubmitEditing={onSubmitEditing}
        onChangeText={(text) => onChange({ "Place of Birth": text })}
      />
    </View>
  );
});

function ConnectionsTimeOfBirthField({
  value, onChange,
}: { value: string; onChange: (vals: PersonBirthUpdate) => void; onRequestDismiss?: () => void }) {
  return (
    <View style={{ marginBottom: verticalScale(8) }}>
      <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: moderateScale(11), marginBottom: 4 }}>
        TIME OF BIRTH
      </Text>
      <TextInput
        style={{
          color: "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.3)",
          paddingVertical: verticalScale(6),
          fontSize: moderateScale(15),
        }}
        placeholder="HH:MM AM/PM"
        placeholderTextColor="rgba(255,255,255,0.4)"
        value={value}
        onChangeText={(text) => onChange({ "Time of Birth": text })}
      />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SingleConnectionCreateScreen() {
  const { theme } = useContext(ThemeContext);
  const { authUser, userDoc } = useUser();
  const { chartDetails } = useHoroscope();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + verticalScale(NAV_BAR_HEIGHT);

  const [isMe, setIsMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Calculating cosmic alignment...");

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
    { label: "First Name", type: "text", placeholder: "Enter first name" },
    { label: "Last Name", type: "text", placeholder: "Enter last name" },
    { label: "Pronouns", type: "pronouns", placeholder: "Select Pronouns" },
    { label: "Birthday", type: "date", placeholder: "MM/DD/YYYY" },
    { label: "Place of Birth", type: "location" },
    { label: "Time of Birth", type: "time", placeholder: "Select time" },
  ];

  type PersonKey = "first" | "second";

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

  const relationshipOptions = ["consistent", "it's complicated", "toxic"];

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
    const missing = required.filter((f) => isEmpty(person[f]));
    if (missing.length > 0) {
      Alert.alert("Missing Information", `${label}: please enter ${missing.join(", ")}.`);
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
        if (!person["Time of Birth"]) throw new Error("Time of Birth is missing");

        const { birthLat, birthLon, birthTimezone } = person;
        if (birthLat == null || birthLon == null) {
          throw new Error("Place of Birth must include latitude and longitude.");
        }

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

        // Convert IANA timezone string to numeric UTC offset
        let tzone = 0;
        if (birthTimezone) {
          try {
            const testDate = new Date(year, month - 1, day, hour, min);
            const parts = new Intl.DateTimeFormat("en-US", {
              timeZone: birthTimezone,
              timeZoneName: "shortOffset",
            }).formatToParts(testDate);
            const offsetStr = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
            const offsetMatch = offsetStr.match(/GMT([+-]\d+(?::\d+)?)/);
            if (offsetMatch) {
              const [hh, mm] = offsetMatch[1].split(":").map(Number);
              tzone = hh + (mm ? (mm / 60) * Math.sign(hh) : 0);
            }
          } catch {
            tzone = 0;
          }
        }

        return { day, month, year, hour, min, lat: birthLat, lon: birthLon, tzone };
      };

      let enrichedFirst: any;
      if (isMe) {
        const nameParts = (userDoc?.name ?? "").split(" ");
        enrichedFirst = {
          "First Name": nameParts[0] ?? "",
          "Last Name": nameParts.slice(1).join(" ") ?? "",
          Pronouns: "",
          // TODO: load sun/moon/rising from natalChart/details subcollection
          "Sun Sign": "", "Moon Sign": "", "Rising Sign": "",
        };
      } else {
        const firstBirthParams = extractBirthParams(firstPerson);
        const firstSigns = await getAstroSigns(firstBirthParams);
        enrichedFirst = {
          ...firstPerson,
          "Sun Sign": firstSigns.sunSign,
          "Moon Sign": firstSigns.moonSign,
          "Rising Sign": firstSigns.risingSign,
          userName: `${firstPerson["First Name"]} ${firstPerson["Last Name"]}`,
        };
      }

      const secondBirthParams = extractBirthParams(secondPerson);
      const secondSigns = await getAstroSigns(secondBirthParams);
      const enrichedSecond = {
        ...secondPerson,
        "Sun Sign": secondSigns.sunSign,
        "Moon Sign": secondSigns.moonSign,
        "Rising Sign": secondSigns.risingSign,
      };

      const connectionReport = await createConnection({
        userId: authUser!.uid,
        isMe, relationshipType,
        firstPerson: enrichedFirst,
        secondPerson: enrichedSecond,
      });

      router.replace({ pathname: "/connection/[id]", params: { id: connectionReport.connectionId } });
      return;
    } catch (err) {
      console.error("Error saving connection:", err);
      dismissAllSuggestions();
      Keyboard.dismiss();
      Alert.alert("Error", "Something went wrong creating this connection.");
    }

    setLoading(false);
  };

  const nameParts = (userDoc?.name ?? "").split(" ");
  const userFirstName = nameParts[0] ?? "";
  const userLastName = nameParts.slice(1).join(" ") ?? "";

  if (loading) {
    return <LoadingScreen progress={0} message={loadingMessage} />;
  }

  return (
    <>
      <HeaderNav
        title="New Connection"
        rightLabel="Cancel"
        onRightPress={handleCancel}
      />
      <Animated.View style={[styles.container, { opacity: fade, marginTop: headerHeight }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <FlatList
            data={sections}
            keyExtractor={(item) => item.key}
            style={{ backgroundColor: "transparent" }}
            contentContainerStyle={{ paddingTop: verticalScale(5), paddingBottom: verticalScale(20) }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View style={styles.section}>
                <View style={styles.userRow}>
                  <Text style={styles.titleText}>{item.title}</Text>
                  {item.toggle && <DelalunaToggle label="Me" value={isMe} onToggle={setIsMe} />}
                </View>

                <View style={styles.divider} />

                {item.key === "first" && isMe ? (
                  <View style={styles.meCard}>
                    <Text style={styles.meName}>
                      {toTitleCase(userFirstName)} {toTitleCase(userLastName)}
                    </Text>
                    <HomeSignsDisplay
                      sun={chartDetails?.planets.find(p => p.name === 'Sun')?.sign ?? ''}
                      moon={chartDetails?.moon.sign ?? ''}
                      rising={chartDetails?.ascendant.sign ?? ''}
                      showViewChart={false}
                    />
                  </View>
                ) : (
                  (() => {
                    const personKey = item.key as PersonKey;
                    return item.fields.map((field) => {
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

                      if (field.label === "Place of Birth") {
                        return (
                          <ConnectionsPlaceOfBirthField
                            key={field.label}
                            value={personKey === "first" ? firstPerson["Place of Birth"] ?? "" : secondPerson["Place of Birth"] ?? ""}
                            onChange={(vals) => item.onChange((prev: PersonBirthData) => ({ ...prev, ...vals }))}
                            ref={personKey === "first" ? firstLocationRef : secondLocationRef}
                            onRequestDismiss={dismissAllSuggestions}
                            returnKeyType={returnKeyType}
                            blurOnSubmit={!nextExists}
                            onSubmitEditing={() => handleSubmitEditing(personKey, field.label)}
                          />
                        );
                      }

                      if (field.label === "Time of Birth") {
                        return (
                          <ConnectionsTimeOfBirthField
                            key={field.label}
                            value={personKey === "first" ? firstPerson["Time of Birth"] : secondPerson["Time of Birth"]}
                            onChange={(vals) => item.onChange((prev: PersonBirthData) => ({ ...prev, ...vals }))}
                            onRequestDismiss={dismissAllSuggestions}
                          />
                        );
                      }

                      return (
                        <DelalunaInputRow
                          key={field.label}
                          fields={[{ ...field, value, inputRef, returnKeyType, blurOnSubmit: field.type === "text" ? false : undefined, onSubmitEditing }]}
                          onChange={(vals) => item.onChange((prev: PersonBirthData) => ({ ...prev, ...vals }))}
                        />
                      );
                    });
                  })()
                )}

                {item.key === "second" && (
                  <View style={styles.relationshipRow}>
                    {relationshipOptions.map((option) => {
                      const key = option.toLowerCase();
                      const iconSource =
                        key === "consistent"
                          ? require("@/src/assets/connections/satisfied_icon.png")
                          : key === "it's complicated"
                            ? require("@/src/assets/connections/neutral_icon.png")
                            : require("@/src/assets/connections/dissatisfied_icon.png");

                      return (
                        <TouchableOpacity
                          key={option}
                          style={[styles.relationshipButton, relationshipType === option && styles.relationshipSelected]}
                          onPress={() => { dismissAllSuggestions(); setRelationshipType(option); }}
                          activeOpacity={0.8}
                        >
                          <Image
                            source={iconSource}
                            style={[styles.relationshipIcon, relationshipType === option && styles.relationshipIconSelected]}
                            resizeMode="contain"
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
            ListFooterComponent={
              <View style={styles.footerSections}>
                <GlassButton title="Thassit" onPress={handleSaveConnection} />
              </View>
            }
          />
        </KeyboardAvoidingView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  section: {
    width: "100%",
    paddingHorizontal: scale(10),
    paddingBottom: verticalScale(20),
    marginBottom: verticalScale(10),
    backgroundColor: "transparent",
    gap: verticalScale(15),
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
    marginVertical: verticalScale(6),
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
    color: "#FFFFFF",
    fontSize: moderateScale(18),
    fontWeight: "700",
  },
  relationshipRow: {
    flexDirection: "row",
    height: verticalScale(85),
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
  },
  relationshipSelected: {
    backgroundColor: "rgba(142,68,173,0.7)",
    borderColor: "#FFFFFF",
  },
  relationshipIcon: {
    width: scale(65),
    height: scale(65),
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
    gap: verticalScale(15),
  },
});
