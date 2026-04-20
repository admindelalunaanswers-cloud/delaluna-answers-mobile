import React, { useContext, useEffect, useRef, useState } from "react";

import {
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
  ActivityIndicator,
} from "react-native";

import { router } from "expo-router";

import { httpsCallable } from "firebase/functions";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

import HeaderNav from "@/src/components/shared/header-nav";
import { ThemedView } from "@/src/components/themed-view";
import HomeSignsDisplay from "@/src/components/shared/signs-display.component";
import { GlassButton } from "@/src/assets/buttons/glass-button";
import { ThemeContext } from "@/src/context/theme-context";
import { calculateNatalChart, NatalChart } from "@/src/services/astroEngine";
import { functions } from "@/firebaseConfig";
import { useHoroscope } from "@/src/context/horoscope-context";
import { useUser } from "@/src/context/user-context";
import { verticalScale, scale, moderateScale } from "@/src/utils/responsive";
import {
  NominatimResult,
  formatPlace,
  searchNominatim,
  detectTimezoneOffset,
} from "@/src/utils/location";

import LoadingScreen from "../(util)/loading-screen";
import { ThemedText } from "@/src/components/themed-text";
import { C } from "@/src/constants/theme";
import { buildCompatibilityPrompt } from "@/src/prompts/compatibility-prompt";

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

// ─── Local utilities ──────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}


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

// ─── Stub components (TODO: extract into dedicated files) ─────────────────────

function DelalunaToggle({
  label, value, onToggle,
}: { label: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <ThemedView style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Switch value={value} onValueChange={onToggle} />
      <ThemedText style={{ color: "#FFFFFF", fontSize: moderateScale(14) }}>{label}</ThemedText>
    </ThemedView>
  );
}

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
  value, onChange,
}: { value: string; onChange: (vals: PersonBirthUpdate) => void }) {
  const [textValue, setTextValue] = useState(value);
  const [dateValue, setDateValue] = useState(new Date());
  const [pickerVisible, setPickerVisible] = useState(false);

  const onDateTextChange = (text: string) => {
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
            placeholder="MM/DD/YYYY"
            placeholderTextColor="rgba(255,255,255,0.4)"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          <TouchableOpacity
            style={fieldStyles.iconBtn}
            onPress={() => { Keyboard.dismiss(); setPickerVisible(true); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="calendar-outline" size={moderateScale(22)} color="rgba(255,255,255,0.55)" />
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
  }
>(({ value, birthday, isUnknown: initialIsUnknown, onChange }, ref) => {
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
            <ThemedText style={styles.unknownLink}>Enter location</ThemedText>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ThemedView style={fieldStyles.inputWithIcon}>
            <TextInput
              ref={inputRef}
              style={fieldStyles.textInput}
              placeholder="City, State, Country"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={query}
              autoCapitalize="words"
              onChangeText={onLocationChange}
            />
            {(searching || tzLoading) && (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
            )}
          </ThemedView>
          {results.length > 0 && (
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
          <TouchableOpacity onPress={handleSkip}>
            <ThemedText style={styles.skipLink}>I don't know</ThemedText>
          </TouchableOpacity>
        </>
      )}
    </ThemedView>
  );
});

function ConnectionsTimeOfBirthField({
  value, isUnknown: initialIsUnknown, onChange,
}: { value: string; isUnknown?: boolean; onChange: (vals: PersonBirthUpdate) => void; onRequestDismiss?: () => void }) {
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
            <ThemedText style={styles.unknownLink}>Enter time</ThemedText>
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
        console.log("Saving connection with data:", { enrichedFirst, userNatalChart });
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
         console.log("Saving New First Person connection with data:", { enrichedFirst, userNatalChart });
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
      console.log("Saving New Second Person connection with data:", { enrichedSecond, secondChart });

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
      const result = await createConnectionFn({
        userId: authUser!.uid,
        isMe,
        relationshipType: relationshipType!,
        firstPerson: enrichedFirst,
        secondPerson: enrichedSecond,
        prompt,
      }) as { data: { connectionId: string } };

      router.replace({ pathname: "/connection/[id]", params: { id: result.data.connectionId } });
      return;
    } catch (err) {
      console.error("Error saving connection:", err);
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
    return <LoadingScreen progress={0} message={loadingMessage} />;
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
                  <ThemedText style={styles.titleText}>{item.title}</ThemedText>
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
                  })()
                )}

                {item.key === "second" && (
                  <ThemedView style={styles.relationshipRow}>
                    {relationshipOptions.map((option) => {
                      const key = option.toLowerCase();
                      const iconSource =
                        key.toLowerCase().includes("consistent")
                          ? require("@/src/assets/connections/consistent_icon.png")
                          : key.toLowerCase().includes("complicated")
                            ? require("@/src/assets/connections/complicated_icon.png")
                            : require("@/src/assets/connections/dunno_icon.png");
                            
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
                          <ThemedText type="sectionDefinition" style={{ color: relationshipType === option ? "#FFFFFF" : "rgba(255,255,255,0.7)", marginTop: verticalScale(4) }}>
                            {option}
                          </ThemedText>
          
                         
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
