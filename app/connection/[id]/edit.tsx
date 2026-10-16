/* eslint-disable react/display-name */
/* eslint-disable react/no-unescaped-entities */
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import React, { useContext, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    TextInput,
    TouchableOpacity,
} from "react-native";
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
import {
    detectTimezoneOffset,
    formatPlace,
    NominatimResult,
    searchNominatim,
} from "@/src/utils/location";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";

import LoadingScreen from "../../(util)/loading-screen";
import { logger } from "@/src/utils/logger";

const NAV_BAR_HEIGHT = 44;
const MAX_BIRTH_DETAIL_CHANGES = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

type PersonBirthData = {
  "First Name": string;
  "Last Name": string;
  Pronouns: string;
  Birthday: string;
  "Place of Birth": string;
  "Time of Birth": string;
  birthLat?: number;
  birthLon?: number;
  birthTimezone?: number;
  isBirthTimeUnknown?: boolean;
  isPlaceOfBirthUnknown?: boolean;
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
  onFocus?: () => void;
};

// ─── Shared field styles ──────────────────────────────────────────────────────

const fieldStyles = StyleSheet.create({
  label: {
    color: "rgba(255,255,255,0.6)",
    fontSize: moderateScale(11),
    marginBottom: 4,
  },
  inputWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.3)",
  },
  textInput: {
    color: "#FFFFFF",
    paddingVertical: verticalScale(6),
    fontSize: moderateScale(15),
    flex: 1,
  },
  iconBtn: {
    paddingLeft: scale(8),
    paddingBottom: verticalScale(2),
  },
  locationDrop: {
    backgroundColor: "rgba(20,20,30,0.95)",
    borderRadius: scale(8),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    marginTop: verticalScale(4),
  },
  locationRow: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  locationRowText: {
    color: "#FFFFFF",
    fontSize: moderateScale(13),
  },
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function DelalunaInputRow({
  fields, onChange,
}: { fields: FieldConfig[]; onChange: (vals: PersonBirthUpdate) => void }) {
  return (
    <>
      {fields.map((field) => (
        <ThemedView key={field.label} style={{ marginBottom: verticalScale(8) }}>
          <ThemedText style={{ color: "rgba(255,255,255,0.6)", fontSize: moderateScale(11), marginBottom: 4 }}>
            {field.label.toUpperCase()}
          </ThemedText>
          <TextInput
            ref={field.inputRef}
            style={{
              color: "#FFFFFF",
              borderBottomWidth: 1,
              borderBottomColor: "rgba(255,255,255,0.3)",
              paddingVertical: verticalScale(6),
              fontSize: moderateScale(15),
            }}
            accessibilityLabel={field.label}
            placeholder={field.placeholder}
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={typeof field.value === "string" ? field.value : ""}
            editable={field.editable !== false}
            returnKeyType={field.returnKeyType}
            submitBehavior={field.blurOnSubmit === false ? "newline" : "blurAndSubmit"}
            onSubmitEditing={field.onSubmitEditing}
            onFocus={field.onFocus}
            onChangeText={(text) => onChange({ [field.label]: text } as PersonBirthUpdate)}
          />
        </ThemedView>
      ))}
    </>
  );
}

const PRONOUN_OPTIONS = ["She/Her", "He/Him", "They/Them", "Non Binary"];

function PronounsField({
  value, onChange,
}: { value: string; onChange: (vals: PersonBirthUpdate) => void }) {
  return (
    <ThemedView style={{ marginBottom: verticalScale(8) }}>
      <ThemedText style={fieldStyles.label}>PRONOUNS</ThemedText>
      <ThemedView style={{ flexDirection: "row", flexWrap: "wrap", gap: scale(8), marginTop: verticalScale(2) }}>
        {PRONOUN_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.pronounBtn, value === option && styles.pronounBtnSelected]}
            onPress={() => onChange({ Pronouns: option })}
            activeOpacity={0.8}
          >
            <ThemedText style={[styles.pronounTxt, value === option && styles.pronounTxtSelected]}>
              {option}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ThemedView>
    </ThemedView>
  );
}

function ConnectionsBirthdayField({
  value, onChange, editable = true,
}: { value: string; onChange: (vals: PersonBirthUpdate) => void; editable?: boolean }) {
  const [textValue, setTextValue] = useState(value);
  const [dateValue, setDateValue] = useState(new Date());
  const [pickerVisible, setPickerVisible] = useState(false);

  const onDateTextChange = (text: string) => {
    if (!editable) return;
    if (text.length < textValue.length) {
      setTextValue(text);
      onChange({ Birthday: text });
      return;
    }
    const digits = text.replace(/\D/g, "").slice(0, 8);
    if (!digits) { setTextValue(""); onChange({ Birthday: "" }); return; }
    let formatted = digits.slice(0, 2);
    if (digits.length >= 2) formatted += "/";
    if (digits.length >= 3) formatted += digits.slice(2, 4);
    if (digits.length >= 4) formatted += "/";
    if (digits.length >= 5) formatted += digits.slice(4, 8);
    setTextValue(formatted);
    onChange({ Birthday: formatted });
    if (digits.length === 8) {
      const mo = parseInt(digits.slice(0, 2));
      const da = parseInt(digits.slice(2, 4));
      const yr = parseInt(digits.slice(4, 8));
      const d = new Date(yr, mo - 1, da);
      if (!isNaN(d.getTime())) setDateValue(d);
    }
  };

  return (
    <ThemedView style={{ marginBottom: verticalScale(8) }}>
      <ThemedText style={fieldStyles.label}>BIRTHDAY</ThemedText>
      {Platform.OS === "ios" && pickerVisible ? (
        <ThemedView style={fieldStyles.inputWithIcon}>
          <DateTimePicker
            value={dateValue}
            mode="date"
            display="spinner"
            textColor="#ffffff"
            themeVariant="dark"
            style={{ flex: 1 }}
            onChange={(_, selected) => {
              if (selected) {
                setDateValue(selected);
                const mo = String(selected.getMonth() + 1).padStart(2, "0");
                const da = String(selected.getDate()).padStart(2, "0");
                const formatted = `${mo}/${da}/${selected.getFullYear()}`;
                setTextValue(formatted);
                onChange({ Birthday: formatted });
              }
            }}
          />
          <TouchableOpacity
            style={fieldStyles.iconBtn}
            onPress={() => setPickerVisible(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="keypad-outline" size={moderateScale(22)} color="rgba(111,255,233,0.7)" />
          </TouchableOpacity>
        </ThemedView>
      ) : (
        <ThemedView style={fieldStyles.inputWithIcon}>
          <TextInput
            style={fieldStyles.textInput}
            value={textValue}
            onChangeText={onDateTextChange}
            accessibilityLabel="Birthday"
            accessibilityHint="Format month, day, year"
            placeholder="MM/DD/YYYY"
            placeholderTextColor="rgba(255,255,255,0.4)"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            editable={editable}
          />
          <TouchableOpacity
            style={fieldStyles.iconBtn}
            onPress={() => { Keyboard.dismiss(); setPickerVisible(true); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={!editable}
          >
            <Ionicons name="calendar-outline" size={moderateScale(22)} color={editable ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.2)"} />
          </TouchableOpacity>
        </ThemedView>
      )}
      {Platform.OS === "android" && pickerVisible && (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display="default"
          onChange={(_, selected) => {
            setPickerVisible(false);
            if (selected) {
              setDateValue(selected);
              const mo = String(selected.getMonth() + 1).padStart(2, "0");
              const da = String(selected.getDate()).padStart(2, "0");
              const formatted = `${mo}/${da}/${selected.getFullYear()}`;
              setTextValue(formatted);
              onChange({ Birthday: formatted });
            }
          }}
        />
      )}
    </ThemedView>
  );
}

const ConnectionsPlaceOfBirthField = React.forwardRef<
  { dismissSuggestions: () => void; focus: () => void },
  {
    value: string;
    birthday: string;
    isUnknown?: boolean;
    onChange: (vals: PersonBirthUpdate) => void;
    onRequestDismiss?: () => void;
    editable?: boolean;
  }
>(({ value, birthday, isUnknown: initialIsUnknown, onChange, editable = true }, ref) => {
  const inputRef = useRef<TextInput>(null);
  const [isUnknown, setIsUnknown] = useState(initialIsUnknown ?? false);
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [tzLoading, setTzLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useImperativeHandle(ref, () => ({
    dismissSuggestions: () => setResults([]),
    focus: () => inputRef.current?.focus(),
  }));

  const handleSkip = () => {
    setIsUnknown(true);
    setQuery("");
    setResults([]);
    onChange({ "Place of Birth": "", birthLat: 0, birthLon: 0, birthTimezone: 0, isPlaceOfBirthUnknown: true });
  };

  const handleEnterLocation = () => {
    setIsUnknown(false);
    onChange({ "Place of Birth": "", birthLat: undefined, birthLon: undefined, birthTimezone: undefined, isPlaceOfBirthUnknown: false });
  };

  const onLocationChange = (text: string) => {
    if (!editable) return;
    setQuery(text);
    setResults([]);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (text.trim().length >= 2) {
      searchTimerRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          setResults(await searchNominatim(text));
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      }, 600);
    }
    onChange({ "Place of Birth": text, birthLat: undefined, birthLon: undefined, birthTimezone: undefined });
  };

  const selectLocation = async (r: NominatimResult) => {
    const label = formatPlace(r);
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    setResults([]);
    setQuery(label);
    setTzLoading(true);
    let birthDate = new Date();
    if (birthday) {
      const parts = birthday.split("/");
      if (parts.length === 3) {
        const [mo, da, yr] = parts.map(Number);
        birthDate = new Date(Date.UTC(yr, mo - 1, da, 12, 0, 0));
      }
    }
    const tz = await detectTimezoneOffset(lat, lon, birthDate);
    setTzLoading(false);
    onChange({ "Place of Birth": label, birthLat: lat, birthLon: lon, birthTimezone: tz });
  };

  return (
    <ThemedView style={{ marginBottom: verticalScale(8) }}>
      <ThemedText style={fieldStyles.label}>PLACE OF BIRTH</ThemedText>
      {isUnknown ? (
        <>
          <ThemedText style={styles.unknownText}>I don't know</ThemedText>
          <TouchableOpacity onPress={handleEnterLocation}>
            <ThemedText style={styles.skipLink}>Enter location</ThemedText>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ThemedView style={fieldStyles.inputWithIcon}>
            <TextInput
              ref={inputRef}
              style={fieldStyles.textInput}
              accessibilityLabel="Place of birth"
              placeholder="City, State, Country"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={query}
              autoCapitalize="words"
              onChangeText={onLocationChange}
              editable={editable}
            />
            {(searching || tzLoading) && (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
            )}
          </ThemedView>
          {results.length > 0 && editable && (
            <ThemedView style={fieldStyles.locationDrop}>
              {results.map((r) => (
                <TouchableOpacity
                  key={r.place_id}
                  style={fieldStyles.locationRow}
                  onPress={() => void selectLocation(r)}
                  activeOpacity={0.7}
                >
                  <ThemedText style={fieldStyles.locationRowText} numberOfLines={2}>
                    {formatPlace(r)}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ThemedView>
          )}
          {editable && (
            <TouchableOpacity onPress={handleSkip}>
              <ThemedText style={styles.skipLink}>I don't know</ThemedText>
            </TouchableOpacity>
          )}
        </>
      )}
    </ThemedView>
  );
});

function ConnectionsTimeOfBirthField({
  value, isUnknown: initialIsUnknown, onChange, editable = true,
}: { value: string; isUnknown?: boolean; onChange: (vals: PersonBirthUpdate) => void; editable?: boolean }) {
  const [textValue, setTextValue] = useState(value);
  const [dateValue, setDateValue] = useState(new Date());
  const [pickerVisible, setPickerVisible] = useState(false);
  const [isUnknown, setIsUnknown] = useState(initialIsUnknown ?? false);

  const handleSkip = () => {
    setIsUnknown(true);
    setPickerVisible(false);
    onChange({ "Time of Birth": "12:00", isBirthTimeUnknown: true });
  };

  const handleEnterTime = () => {
    setIsUnknown(false);
    setTextValue("");
    onChange({ "Time of Birth": "", isBirthTimeUnknown: false });
  };

  const onTimeTextChange = (text: string) => {
    if (!editable) return;
    if (text.length < textValue.length) {
      setTextValue(text);
      onChange({ "Time of Birth": text });
      return;
    }
    if (text.includes(":")) {
      setTextValue(text);
      onChange({ "Time of Birth": text });
      const ampm = text.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      const hhmm = text.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (ampm) {
        let h = parseInt(ampm[1]); const min = parseInt(ampm[2]);
        const p = ampm[3].toUpperCase();
        if (p === "PM" && h !== 12) h += 12;
        if (p === "AM" && h === 12) h = 0;
        const dt = new Date(); dt.setHours(h, min, 0, 0); setDateValue(dt);
      } else if (hhmm) {
        const dt = new Date(); dt.setHours(parseInt(hhmm[1]), parseInt(hhmm[2]), 0, 0); setDateValue(dt);
      }
      return;
    }
    const digits = text.replace(/\D/g, "");
    if (!digits) { setTextValue(""); onChange({ "Time of Birth": "" }); return; }
    let formatted: string;
    if (digits.length === 1) {
      formatted = parseInt(digits) >= 2 ? digits + ":" : digits;
    } else {
      const twoDigit = parseInt(digits.slice(0, 2));
      formatted = twoDigit > 12
        ? digits[0] + ":" + digits.slice(1, 3)
        : digits.slice(0, 2) + ":" + digits.slice(2, 4);
    }
    setTextValue(formatted);
    onChange({ "Time of Birth": formatted });
  };

  return (
    <ThemedView style={{ marginBottom: verticalScale(8) }}>
      <ThemedText style={fieldStyles.label}>TIME OF BIRTH</ThemedText>
      {isUnknown ? (
        <>
          <ThemedText style={styles.unknownText}>I don't know</ThemedText>
          <TouchableOpacity onPress={handleEnterTime}>
            <ThemedText style={styles.skipLink}>Enter time</ThemedText>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {Platform.OS === "ios" && pickerVisible ? (
            <ThemedView style={fieldStyles.inputWithIcon}>
              <DateTimePicker
                value={dateValue}
                mode="time"
                display="spinner"
                textColor="#ffffff"
                themeVariant="dark"
                style={{ flex: 1 }}
                onChange={(_, selected) => {
                  if (selected) {
                    setDateValue(selected);
                    const h = selected.getHours();
                    const min = selected.getMinutes();
                    const period = h >= 12 ? "PM" : "AM";
                    const hour12 = h % 12 === 0 ? 12 : h % 12;
                    const formatted = `${hour12}:${String(min).padStart(2, "0")} ${period}`;
                    setTextValue(formatted);
                    onChange({ "Time of Birth": formatted });
                  }
                }}
              />
              <TouchableOpacity
                style={fieldStyles.iconBtn}
                onPress={() => setPickerVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="keypad-outline" size={moderateScale(22)} color="rgba(111,255,233,0.7)" />
              </TouchableOpacity>
            </ThemedView>
          ) : (
            <ThemedView style={fieldStyles.inputWithIcon}>
              <TextInput
                style={fieldStyles.textInput}
                value={textValue}
                onChangeText={onTimeTextChange}
                accessibilityLabel="Time of birth"
                accessibilityHint="Format hour, minutes, A M or P M"
                placeholder="H:MM AM/PM"
                placeholderTextColor="rgba(255,255,255,0.4)"
                keyboardType="numbers-and-punctuation"
              />
              <TouchableOpacity
                style={fieldStyles.iconBtn}
                onPress={() => { Keyboard.dismiss(); setPickerVisible(true); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="time-outline" size={moderateScale(22)} color="rgba(255,255,255,0.55)" />
              </TouchableOpacity>
            </ThemedView>
          )}
          {Platform.OS === "android" && pickerVisible && (
            <DateTimePicker
              value={dateValue}
              mode="time"
              display="default"
              onChange={(_, selected) => {
                setPickerVisible(false);
                if (selected) {
                  setDateValue(selected);
                  const h = selected.getHours();
                  const min = selected.getMinutes();
                  const period = h >= 12 ? "PM" : "AM";
                  const hour12 = h % 12 === 0 ? 12 : h % 12;
                  const formatted = `${hour12}:${String(min).padStart(2, "0")} ${period}`;
                  setTextValue(formatted);
                  onChange({ "Time of Birth": formatted });
                }
              }}
            />
          )}
          <TouchableOpacity onPress={handleSkip}>
            <ThemedText style={styles.skipLink}>I don't know</ThemedText>
          </TouchableOpacity>
        </>
      )}
    </ThemedView>
  );
}

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
      Alert.alert("Missing Information", `${label}: please enter ${missing.join(", ")}.`);
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
              const ref = doc(db, "users", authUser!.uid, "connections", connectionId!);
              await deleteDoc(ref);
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
          keyboardVerticalOffset={insets.bottom + 40}
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
                  <ThemedText style={styles.titleText}>{item.title}</ThemedText>
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
                          value={personKey === "first" ? firstPerson.Pronouns : secondPerson.Pronouns}
                          onChange={(vals) => item.onChange((prev: PersonBirthData) => ({ ...prev, ...vals }))}
                        />
                      );
                    }

                    if (field.label === "Birthday") {
                      return (
                        <ConnectionsBirthdayField
                          key={field.label}
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
                        fields={[{ ...field, value, inputRef, returnKeyType, blurOnSubmit: field.type === "text" ? false : undefined, onSubmitEditing, onFocus: scrollToSection }]}
                        onChange={(vals) => item.onChange((prev: PersonBirthData) => ({ ...prev, ...vals }))}
                      />
                    );
                  });
                })()}

                {item.key === "second" && (
                  <ThemedView style={styles.relationshipRow}>
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
                <TouchableOpacity onPress={handleDelete} activeOpacity={0.7} style={styles.deleteBtn}>
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
