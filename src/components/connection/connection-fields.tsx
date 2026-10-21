/**
 * Birth-detail form fields shared by the New and Edit Connection screens.
 *
 * Both screens used to carry their own copy of these, which had already drifted
 * (Edit gained `editable`; the styles diverged), so every fix had to be made
 * twice. This is Edit's copy — the superset — with New's styles.
 *
 * Every field takes `person` (the section title, e.g. "Second individual"):
 * the form asks for two people, and without it a screen reader heard
 * "Birthday, text field" twice with nothing to say whose.
 */
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
} from "react-native";

import { ThemedText } from "@/src/components/themed-text";
import { ThemedView } from "@/src/components/themed-view";
import { useAnnounce } from "@/src/hooks/use-announce";
import {
  detectTimezoneOffset,
  formatPlace,
  NominatimResult,
  searchNominatim,
} from "@/src/utils/location";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PersonBirthData = {
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

export type PersonBirthUpdate = Partial<PersonBirthData>;

export type FieldType = "text" | "pronouns" | "date" | "location" | "time";

export type FieldConfig = {
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

/** "Second Individual, birthday" — or just "Birthday" with no person. */
export function personFieldLabel(person: string | undefined, field: string): string {
  return person ? `${person}, ${field.toLowerCase()}` : field;
}

/** An action's spoken name, with the person it applies to: "Choose birthday from a calendar, Second Individual". */
function forPerson(action: string, person?: string): string {
  return person ? `${action}, ${person}` : action;
}

/**
 * The uppercase caption above each field. Hidden from screen readers: the input
 * carries the same name (with the person), so reading both said it twice.
 */
const CAPTION_A11Y = {
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

// ─── Styles ───────────────────────────────────────────────────────────────────

const fieldStyles = StyleSheet.create({
  label: {
    color: "rgba(255,255,255,0.75)", // was 0.6 at 11pt, ~4:1
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

const styles = StyleSheet.create({
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
    color: "#ffffff",
    fontSize: moderateScale(14),
    paddingVertical: verticalScale(6),
    fontStyle: "italic",
  },
  unknownLink: {
    color: "#6FFFE9",
    fontSize: moderateScale(12),
    textDecorationLine: "underline",
    marginTop: verticalScale(2),
    alignSelf: "flex-end",
  },
  skipLink: {
    color: "#6FFFE9",
    fontSize: moderateScale(12),
    textDecorationLine: "underline",
    marginTop: verticalScale(6),
    alignSelf: "flex-end",
  },
});

// ─── Components ───────────────────────────────────────────────────────────────

export function DelalunaToggle({
  label, value, onToggle,
}: { label: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <ThemedView style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {/* The label beside a Switch isn't its name — VoiceOver read "Switch button, off" */}
      <Switch value={value} onValueChange={onToggle} accessibilityLabel={label} />
      <ThemedText style={{ color: "#FFFFFF", fontSize: moderateScale(14) }} {...CAPTION_A11Y}>{label}</ThemedText>
    </ThemedView>
  );
}

export function DelalunaInputRow({
  fields, onChange, person,
}: { fields: FieldConfig[]; onChange: (vals: PersonBirthUpdate) => void; person?: string }) {
  return (
    <>
      {fields.map((field) => (
        <ThemedView key={field.label} style={{ marginBottom: verticalScale(8) }}>
          <ThemedText style={fieldStyles.label} {...CAPTION_A11Y}>
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
            accessibilityLabel={personFieldLabel(person, field.label)}
            placeholder={field.placeholder}
            placeholderTextColor="rgba(255,255,255,0.6)"
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

export const PRONOUN_OPTIONS = ["She/Her", "He/Him", "They/Them", "Non Binary"];

export function PronounsField({
  value, onChange, person,
}: { value: string; onChange: (vals: PersonBirthUpdate) => void; person?: string }) {
  return (
    <ThemedView style={{ marginBottom: verticalScale(8) }}>
      <ThemedText style={fieldStyles.label} {...CAPTION_A11Y}>PRONOUNS</ThemedText>
      <ThemedView
        style={{ flexDirection: "row", flexWrap: "wrap", gap: scale(8), marginTop: verticalScale(2) }}
        accessibilityRole="radiogroup"
        accessibilityLabel={personFieldLabel(person, "Pronouns")}
      >
        {PRONOUN_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.pronounBtn, value === option && styles.pronounBtnSelected]}
            onPress={() => onChange({ Pronouns: option })}
            activeOpacity={0.8}
            // The selection was only a fill
            accessibilityRole="radio"
            accessibilityState={{ checked: value === option }}
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

export function ConnectionsBirthdayField({
  value, onChange, editable = true, person,
}: { value: string; onChange: (vals: PersonBirthUpdate) => void; editable?: boolean; person?: string }) {
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
      <ThemedText style={fieldStyles.label} {...CAPTION_A11Y}>BIRTHDAY</ThemedText>
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
            accessibilityRole="button"
            accessibilityLabel={forPerson("Type birthday instead", person)}
          >
            <Ionicons name="keypad-outline" size={moderateScale(22)} color="rgba(111,255,233,0.85)" />
          </TouchableOpacity>
        </ThemedView>
      ) : (
        <ThemedView style={fieldStyles.inputWithIcon}>
          <TextInput
            style={fieldStyles.textInput}
            value={textValue}
            onChangeText={onDateTextChange}
            accessibilityLabel={personFieldLabel(person, "Birthday")}
            accessibilityHint="Format month, day, year"
            placeholder="MM/DD/YYYY"
            placeholderTextColor="rgba(255,255,255,0.6)"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            editable={editable}
          />
          <TouchableOpacity
            style={fieldStyles.iconBtn}
            onPress={() => { Keyboard.dismiss(); setPickerVisible(true); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={!editable}
            accessibilityRole="button"
            accessibilityLabel={forPerson("Choose birthday from a calendar", person)}
            // Locked was only a dimmer icon
            accessibilityState={{ disabled: !editable }}
          >
            <Ionicons name="calendar-outline" size={moderateScale(22)} color={editable ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.2)"} />
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

export const ConnectionsPlaceOfBirthField = React.forwardRef<
  { dismissSuggestions: () => void; focus: () => void },
  {
    value: string;
    birthday: string;
    isUnknown?: boolean;
    onChange: (vals: PersonBirthUpdate) => void;
    onRequestDismiss?: () => void;
    editable?: boolean;
    person?: string;
  }
>(({ value, birthday, isUnknown: initialIsUnknown, onChange, editable = true, person }, ref) => {
  const inputRef = useRef<TextInput>(null);
  const [isUnknown, setIsUnknown] = useState(initialIsUnknown ?? false);
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [tzLoading, setTzLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Results appear under the field with focus still in it.
  useAnnounce(
    results.length > 0 && editable
      ? `${results.length} ${results.length === 1 ? "place" : "places"} found`
      : null,
  );

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
      <ThemedText style={fieldStyles.label} {...CAPTION_A11Y}>PLACE OF BIRTH</ThemedText>
      {isUnknown ? (
        <>
          <ThemedText style={styles.unknownText} accessibilityLabel={personFieldLabel(person, "Place of birth") + ", unknown"}>
            I don&apos;t know
          </ThemedText>
          <TouchableOpacity
            onPress={handleEnterLocation}
            accessibilityRole="button"
            accessibilityLabel={forPerson("Enter place of birth", person)}
          >
            <ThemedText style={styles.skipLink}>Enter location</ThemedText>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ThemedView style={fieldStyles.inputWithIcon}>
            <TextInput
              ref={inputRef}
              style={fieldStyles.textInput}
              accessibilityLabel={personFieldLabel(person, "Place of birth")}
              placeholder="City, State, Country"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={query}
              autoCapitalize="words"
              onChangeText={onLocationChange}
              editable={editable}
            />
            {(searching || tzLoading) && (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" accessibilityLabel="Searching" />
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
                  accessibilityRole="button"
                >
                  <ThemedText style={fieldStyles.locationRowText} numberOfLines={2}>
                    {formatPlace(r)}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ThemedView>
          )}
          {editable && (
            <TouchableOpacity
              onPress={handleSkip}
              accessibilityRole="button"
              accessibilityLabel={forPerson("I don't know the place of birth", person)}
            >
              <ThemedText style={styles.skipLink}>I don&apos;t know</ThemedText>
            </TouchableOpacity>
          )}
        </>
      )}
    </ThemedView>
  );
});
ConnectionsPlaceOfBirthField.displayName = "ConnectionsPlaceOfBirthField";

export function ConnectionsTimeOfBirthField({
  value, isUnknown: initialIsUnknown, onChange, editable = true, person,
}: { value: string; isUnknown?: boolean; onChange: (vals: PersonBirthUpdate) => void; editable?: boolean; person?: string }) {
  const [textValue, setTextValue] = useState(value);
  const [dateValue, setDateValue] = useState(new Date());
  const [pickerVisible, setPickerVisible] = useState(false);
  const [isUnknown, setIsUnknown] = useState(initialIsUnknown ?? false);

  // Birthday and place honoured `editable` everywhere; time only in typed text,
  // so once no changes were left the picker, "I don't know" and "Enter time"
  // could still change it. Every path below checks it now.
  const handleSkip = () => {
    if (!editable) return;
    setIsUnknown(true);
    setPickerVisible(false);
    onChange({ "Time of Birth": "12:00", isBirthTimeUnknown: true });
  };

  const handleEnterTime = () => {
    if (!editable) return;
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
      <ThemedText style={fieldStyles.label} {...CAPTION_A11Y}>TIME OF BIRTH</ThemedText>
      {isUnknown ? (
        <>
          <ThemedText style={styles.unknownText} accessibilityLabel={personFieldLabel(person, "Time of birth") + ", unknown"}>
            I don&apos;t know
          </ThemedText>
          {editable && (
            <TouchableOpacity
              onPress={handleEnterTime}
              accessibilityRole="button"
              accessibilityLabel={forPerson("Enter time of birth", person)}
            >
              <ThemedText style={styles.skipLink}>Enter time</ThemedText>
            </TouchableOpacity>
          )}
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
                  if (selected && editable) {
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
                accessibilityRole="button"
                accessibilityLabel={forPerson("Type time of birth instead", person)}
              >
                <Ionicons name="keypad-outline" size={moderateScale(22)} color="rgba(111,255,233,0.85)" />
              </TouchableOpacity>
            </ThemedView>
          ) : (
            <ThemedView style={fieldStyles.inputWithIcon}>
              <TextInput
                style={fieldStyles.textInput}
                value={textValue}
                onChangeText={onTimeTextChange}
                accessibilityLabel={personFieldLabel(person, "Time of birth")}
                accessibilityHint="Format hour, minutes, A M or P M"
                placeholder="H:MM AM/PM"
                placeholderTextColor="rgba(255,255,255,0.6)"
                keyboardType="numbers-and-punctuation"
                editable={editable}
              />
              <TouchableOpacity
                style={fieldStyles.iconBtn}
                onPress={() => { Keyboard.dismiss(); setPickerVisible(true); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                disabled={!editable}
                accessibilityRole="button"
                accessibilityLabel={forPerson("Choose time of birth", person)}
                accessibilityState={{ disabled: !editable }}
              >
                <Ionicons name="time-outline" size={moderateScale(22)} color={editable ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.2)"} />
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
                if (selected && editable) {
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
          {editable && (
            <TouchableOpacity
              onPress={handleSkip}
              accessibilityRole="button"
              accessibilityLabel={forPerson("I don't know the time of birth", person)}
            >
              <ThemedText style={styles.skipLink}>I don&apos;t know</ThemedText>
            </TouchableOpacity>
          )}
        </>
      )}
    </ThemedView>
  );
}
