import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';
import {
  NominatimResult,
  formatPlace,
  searchNominatim,
  detectTimezoneOffset,
} from '@/src/utils/location';
import PasswordInput from '@/src/components/shared/password-input';
import PolicyModal from '@/src/components/sign-up/policy-modals';
import { privacyPolicy, termsAndConditions } from '@/src/assets/legal/legal-texts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StepConfig {
  key: string;
  inputType: 'text' | 'email' | 'secure' | 'choices' | 'date' | 'time' | 'location' | 'final';
  placeholder?: string;
  choices?: string[];
}

// ─── Questions (personalized with answers state) ──────────────────────────────

const QUESTIONS: Record<string, (a: Record<string, any>) => string> = {
  firstName: () =>
    "Hey, I'm glad you're here! I have a few quick questions for astrological reasons.\n\nWhat's your first name?",
  lastName: (a) =>
    `Welcome, ${a.firstName}! And your last name?`,
  pronouns: (a) =>
    `What are your pronouns, ${a.firstName}?`,
  birthday: (a) =>
    `Nice to meet you, ${[a.firstName, a.lastName].filter(Boolean).join(' ')}!\n\nI need to calculate your birth chart — it's a map of the planets at the exact moment you were born.\n\nWhat's your birthdate?`,
  birthtime: (a) =>
    `Would you happen to know what time you were born, ${a.firstName}?`,
  placeOfBirth: () =>
    `...and where were you born?`,
  email: (a) =>
    `Almost done, ${a.firstName}! What's your email address?`,
  password: () =>
    `Last step — create a password to secure your account.`,
  final: (a) =>
    `Your secrets are safe with us, ${a.firstName} 🔐`,
};

// ─── Answer display formatter ─────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const formatAnswer = (s: StepConfig, a: Record<string, any>): string => {
  if (s.inputType === 'final') return '';
  if (s.key === 'placeOfBirth' && a.isPlaceOfBirthUnknown) return "I don't know";
  if (s.key === 'birthtime' && a.isBirthTimeUnknown) return "I don't know";
  if (s.inputType === 'secure') return '••••••••';
  const val = a[s.key];
  if (!val && val !== 0) return '';
  if (s.inputType === 'date' && typeof val === 'string') {
    const [y, m, d] = val.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  }
  if (s.inputType === 'time' && typeof val === 'string') {
    const [h, min] = val.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(min).padStart(2, '0')} ${period}`;
  }
  return String(val);
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChatFlowProps {
  steps: StepConfig[];
  onComplete: (answers: Record<string, any>) => void;
  step: number;
  setStep: (n: number) => void;
  keyboardOffset?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatFlow({
  steps,
  onComplete,
  step,
  setStep,
  keyboardOffset = 0,
}: ChatFlowProps) {
  const insets = useSafeAreaInsets();
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentValue, setCurrentValue] = useState('');
  const [dateValue, setDateValue] = useState(new Date());
  const [dateError, setDateError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  // Location search state
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState<NominatimResult[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationTzLoading, setLocationTzLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ label: string; lat: number; lon: number; tz: number } | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [checkedPolicy, setCheckedPolicy] = useState(false);
  const [checkedTerms, setCheckedTerms] = useState(false);
  const [isPolicyModalVisible, setIsPolicyModalVisible] = useState(false);
  const [policyModalContent, setPolicyModalContent] = useState<'Privacy Policy' | 'Terms & Conditions'>('Privacy Policy');

  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleScroll = (delay: number) => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, delay);
  };

  // Scroll to bottom after keyboard fully settles
  const [kbVisible, setKbVisible] = useState(false);
  useEffect(() => {
    const onShow = Keyboard.addListener('keyboardDidShow', () => { setKbVisible(true); scheduleScroll(120); });
    const onHide = Keyboard.addListener('keyboardDidHide', () => { setKbVisible(false); scheduleScroll(120); });
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  // Restore saved answer + auto-focus input whenever step changes (forward or back)
  useEffect(() => {
    const s = steps[step];
    if (!s) return;
    const saved = answers[s.key];

    setDateError(null);
    setEmailError(null);
    setPasswordError(null);
    setPickerVisible(false);

    if (s.inputType === 'text' || s.inputType === 'email' || s.inputType === 'secure') {
      setCurrentValue(saved != null ? String(saved) : '');
    } else if (s.inputType === 'date') {
      if (saved) {
        const [y, m, d] = String(saved).split('-').map(Number);
        setDateValue(new Date(y, m - 1, d));
        setCurrentValue(`${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`);
      } else {
        setCurrentValue('');
      }
    } else if (s.inputType === 'time') {
      if (saved && !answers.isBirthTimeUnknown) {
        const [h, min] = String(saved).split(':').map(Number);
        const dt = new Date();
        dt.setHours(h, min, 0, 0);
        setDateValue(dt);
        const period = h >= 12 ? 'PM' : 'AM';
        const hour12 = h % 12 === 0 ? 12 : h % 12;
        setCurrentValue(`${hour12}:${String(min).padStart(2, '0')} ${period}`);
      } else {
        setCurrentValue('');
      }
    } else if (s.inputType === 'location') {
      const label = saved != null ? String(saved) : '';
      setLocationQuery(label);
      if (label && answers.birthLat != null && !answers.isPlaceOfBirthUnknown) {
        setSelectedLocation({ label, lat: answers.birthLat, lon: answers.birthLon, tz: answers.birthTimezone ?? 0 });
      } else {
        setSelectedLocation(null);
      }
    }

    // Scroll to the new question bubble.  Use a delay long enough for both
    // the content re-render and the subsequent keyboard-open animation to finish.
    scheduleScroll(350);

    if (['text', 'email', 'secure', 'location', 'date', 'time'].includes(s.inputType)) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [step]);

  const currentStep = steps[step];
  if (!currentStep) return null;

  const advance = (updatedAnswers: Record<string, any>) => {
    setAnswers(updatedAnswers);
    setCurrentValue('');
    setDateValue(new Date());
    setDateError(null);
    setEmailError(null);
    setPasswordError(null);
    setLocationQuery('');
    setLocationResults([]);
    setSelectedLocation(null);
    setPickerVisible(false);
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete(updatedAnswers);
    }
  };

  // ── Email validation ──────────────────────────────────────────────────────
  // Format-only check. Existence is enforced server-side at signUp() — a
  // probe here would be an account-enumeration oracle.

  const handleEmailNext = () => {
    const email = currentValue.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setEmailError(null);
    advance({ ...answers, [currentStep.key]: email });
  };

  // ── Standard next ─────────────────────────────────────────────────────────

  const handleNext = () => {
    const { key, inputType } = currentStep;
    if (inputType === 'email') { void handleEmailNext(); return; }
    if (inputType === 'final') { onComplete(answers); return; }
    if (inputType === 'secure') {
      const pwd = currentValue;
      if (/\s/.test(pwd)) {
        setPasswordError('Password cannot contain spaces or whitespace.');
        return;
      }
      if (pwd.length < 8) {
        setPasswordError('Password must be at least 8 characters.');
        return;
      }
      if (!/[A-Z]/.test(pwd)) {
        setPasswordError('Password must contain one uppercase letter (A–Z).');
        return;
      }
      if (!/[a-z]/.test(pwd)) {
        setPasswordError('Password must contain one lowercase letter (a–z).');
        return;
      }
      if (!/\d/.test(pwd)) {
        setPasswordError('Password must contain one number (0–9).');
        return;
      }
      setPasswordError(null);
    }
    let value: any = currentValue;
    if (inputType === 'date') {
      if (!currentValue.trim()) {
        setDateError('Please enter or select a date.');
        return;
      }
      const parts = currentValue.trim().split('/');
      let parsed: Date | null = null;
      if (parts.length === 3) {
        const [mo, da, yr] = parts.map(Number);
        const d = new Date(yr, mo - 1, da);
        if (!isNaN(d.getTime()) && d.getFullYear() === yr && d.getMonth() === mo - 1 && d.getDate() === da) {
          parsed = d;
        }
      }
      if (!parsed) {
        setDateError('Please enter a valid date in MM/DD/YYYY format.');
        return;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (parsed > today) {
        setDateError('Date cannot be in the future.');
        return;
      }
      const ageDiff = today.getFullYear() - parsed.getFullYear();
      const monthDiff = today.getMonth() - parsed.getMonth();
      const dayDiff = today.getDate() - parsed.getDate();
      const age = ageDiff - (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? 1 : 0);
      if (age < 18) {
        setDateError('You must be at least 18 years old to register.');
        return;
      }
      setDateError(null);
      const yyyy = parsed.getFullYear();
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const dd = String(parsed.getDate()).padStart(2, '0');
      value = `${yyyy}-${mm}-${dd}`;
    } else if (inputType === 'time') {
      if (!currentValue.trim()) {
        setDateError('Please enter or select a time.');
        return;
      }
      const ampmMatch = currentValue.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      const hhmmMatch = currentValue.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (ampmMatch) {
        let h = parseInt(ampmMatch[1]);
        const min = parseInt(ampmMatch[2]);
        const period = ampmMatch[3].toUpperCase();
        if (h < 1 || h > 12 || min > 59) {
          setDateError('Please enter a valid time (e.g. 3:45 PM or 15:45).');
          return;
        }
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        value = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      } else if (hhmmMatch) {
        const h = parseInt(hhmmMatch[1]);
        const min = parseInt(hhmmMatch[2]);
        if (h > 23 || min > 59) {
          setDateError('Please enter a valid time (e.g. 3:45 PM or 15:45).');
          return;
        }
        value = `${String(h).padStart(2, '0')}:${hhmmMatch[2]}`;
      } else {
        setDateError('Please enter a valid time (e.g. 3:45 PM or 15:45).');
        return;
      }
    }
    advance({ ...answers, [key]: value });
  };

  const handleSkipTime = () => {
    advance({ ...answers, [currentStep.key]: '12:00', isBirthTimeUnknown: true });
  };

  const onDateTextChange = (text: string) => {
    setDateError(null);

    // Deletion: pass through as-is
    if (text.length < currentValue.length) {
      setCurrentValue(text);
      return;
    }

    // Extract digits only and auto-format as MM/DD/YYYY
    const digits = text.replace(/\D/g, '').slice(0, 8);
    if (!digits) { setCurrentValue(''); return; }

    let formatted = digits.slice(0, 2);
    if (digits.length >= 2) formatted += '/';
    if (digits.length >= 3) formatted += digits.slice(2, 4);
    if (digits.length >= 4) formatted += '/';
    if (digits.length >= 5) formatted += digits.slice(4, 8);

    setCurrentValue(formatted);

    // Sync dateValue when all 8 digits are present
    if (digits.length === 8) {
      const mo = parseInt(digits.slice(0, 2));
      const da = parseInt(digits.slice(2, 4));
      const yr = parseInt(digits.slice(4, 8));
      const d = new Date(yr, mo - 1, da);
      if (!isNaN(d.getTime()) && d.getFullYear() === yr && d.getMonth() === mo - 1 && d.getDate() === da) {
        setDateValue(d);
      }
    }
  };

  const onTimeTextChange = (text: string) => {
    setDateError(null);

    // Deletion: pass through as-is
    if (text.length < currentValue.length) {
      setCurrentValue(text);
      return;
    }

    // Colon already present: clamp minutes to 59 and sync dateValue
    if (text.includes(':')) {
      const colonIdx = text.indexOf(':');
      const afterColon = text.slice(colonIdx + 1);
      const minDigits = afterColon.match(/^(\d{2})/);
      const clamped = minDigits && parseInt(minDigits[1]) > 59
        ? text.slice(0, colonIdx + 1) + '59' + afterColon.slice(2)
        : text;
      setCurrentValue(clamped);
      const ampm = clamped.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      const hhmm = clamped.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (ampm) {
        let h = parseInt(ampm[1]); const min = parseInt(ampm[2]);
        const p = ampm[3].toUpperCase();
        if (p === 'PM' && h !== 12) h += 12;
        if (p === 'AM' && h === 12) h = 0;
        const dt = new Date(); dt.setHours(h, min, 0, 0); setDateValue(dt);
      } else if (hhmm) {
        const dt = new Date(); dt.setHours(parseInt(hhmm[1]), parseInt(hhmm[2]), 0, 0); setDateValue(dt);
      }
      return;
    }

    // No colon yet — extract digits and auto-insert colon when hour is complete
    const digits = text.replace(/\D/g, '');
    if (!digits) { setCurrentValue(''); return; }

    if (digits.length === 1) {
      // Digit 2–9: single-digit hour is done, auto-add colon
      setCurrentValue(parseInt(digits) >= 2 ? digits + ':' : digits);
    } else {
      const twoDigit = parseInt(digits.slice(0, 2));
      if (twoDigit > 12) {
        // First digit alone is the hour (e.g. "35" → "3:5")
        setCurrentValue(digits[0] + ':' + digits.slice(1, 3));
      } else {
        // Two-digit hour complete, append minutes
        setCurrentValue(digits.slice(0, 2) + ':' + digits.slice(2, 4));
      }
    }
  };

  const handleChoice = (choice: string) => {
    advance({ ...answers, [currentStep.key]: choice });
  };

  // ── Location search ───────────────────────────────────────────────────────

  const searchLocation = async (query: string) => {
    setLocationSearching(true);
    try {
      setLocationResults(await searchNominatim(query));
    } catch {
      setLocationResults([]);
    } finally {
      setLocationSearching(false);
    }
  };

  const onLocationChange = (text: string) => {
    setLocationQuery(text);
    setLocationResults([]);
    setSelectedLocation(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (text.trim().length >= 2) {
      searchTimerRef.current = setTimeout(() => searchLocation(text), 600);
    }
  };

  const selectLocation = async (r: NominatimResult) => {
    const label = formatPlace(r);
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    const birthdayStr = answers.birthday as string | undefined;
    const birthDate = birthdayStr
      ? (() => { const [y, m, d] = birthdayStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); })()
      : new Date();
    setLocationResults([]);
    setLocationQuery(label);
    setLocationTzLoading(true);
    const tz = await detectTimezoneOffset(lat, lon, birthDate);
    setLocationTzLoading(false);
    setSelectedLocation({ label, lat, lon, tz });
  };

  const handleLocationNext = () => {
    if (!selectedLocation) return;
    advance({
      ...answers,
      [currentStep.key]: selectedLocation.label,
      birthLat: selectedLocation.lat,
      birthLon: selectedLocation.lon,
      birthTimezone: selectedLocation.tz,
      isPlaceOfBirthUnknown: false,
    });
  };

  const skipLocation = () => {
    advance({
      ...answers,
      [currentStep.key]: null,
      birthLat: 0,
      birthLon: 0,
      birthTimezone: 0,
      isPlaceOfBirthUnknown: true,
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const { inputType, placeholder, choices } = currentStep;
  const question = QUESTIONS[currentStep.key]?.(answers) ?? '';

  return (
    <>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : kbVisible ? 'height' : undefined}
      keyboardVerticalOffset={insets.top + keyboardOffset}
    >
      {/* ── Chat history ── */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scheduleScroll(80)}
      >
        {/* Completed Q&A pairs */}
        {steps.slice(0, step).map((s, i) => {
          if (s.inputType === 'final') return null;
          const answerDisplay = formatAnswer(s, answers);
          return (
            <View key={i} style={styles.chatPair}>
              <View style={styles.questionBubble}>
                <Text style={styles.questionText}>{QUESTIONS[s.key]?.(answers) ?? ''}</Text>
              </View>
              {!!answerDisplay && (
                <View style={styles.answerBubble}>
                  <Text style={styles.answerText}>{answerDisplay}</Text>
                </View>
              )}
            </View>
          );
        })}

        {/* Current question */}
        <View style={styles.questionBubble}>
          <Text style={styles.questionText}>{question}</Text>
        </View>
      </ScrollView>

      {/* ── Input area (fixed at bottom) ── */}
      <View style={[styles.inputArea, { paddingBottom: insets.bottom + verticalScale(8) }]}>

        {/* Choices */}
        {inputType === 'choices' && choices && (
          <View style={styles.choicesContainer}>
            {choices.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.choiceButton, answers[currentStep.key] === c && styles.choiceSelected]}
                onPress={() => handleChoice(c)}
              >
                <Text style={styles.choiceText}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Date picker */}
        {inputType === 'date' && (
          <View style={styles.fieldWrapper}>
            {/* iOS: toggle between text field and inline spinner */}
            {Platform.OS === 'ios' && pickerVisible ? (
              <View style={styles.textInputRow}>
                <View style={{ flex: 1 }}>
                  <DateTimePicker
                    value={dateValue}
                    mode="date"
                    display="spinner"
                    textColor="#ffffff"
                    themeVariant="dark"
                    onChange={(_, selected) => {
                      if (selected) {
                        setDateValue(selected);
                        const mo = String(selected.getMonth() + 1).padStart(2, '0');
                        const da = String(selected.getDate()).padStart(2, '0');
                        setCurrentValue(`${mo}/${da}/${selected.getFullYear()}`);
                        setDateError(null);
                      }
                    }}
                  />
                </View>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => setPickerVisible(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  focusable={false}
                >
                  <Ionicons name="keypad-outline" size={moderateScale(22)} color="rgba(111,255,233,0.7)" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sendButton, !currentValue.trim() && styles.sendButtonDisabled]}
                  onPress={handleNext}
                  disabled={!currentValue.trim()}
                >
                  <Ionicons name="arrow-forward" size={moderateScale(20)} color="#6FFFE9" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.textInputRow}>
                <View style={styles.inputWithIcon}>
                  <TextInput
                    ref={inputRef}
                    style={styles.inputInner}
                    value={currentValue}
                    onChangeText={onDateTextChange}
                    placeholder="MM/DD/YYYY"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    keyboardType="numbers-and-punctuation"
                    returnKeyType="next"
                    onSubmitEditing={handleNext}
                    maxLength={10}
                  />
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => { Keyboard.dismiss(); setPickerVisible(true); }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    focusable={false}
                  >
                    <Ionicons name="calendar-outline" size={moderateScale(22)} color="rgba(255,255,255,0.55)" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.sendButton, !currentValue.trim() && styles.sendButtonDisabled]}
                  onPress={handleNext}
                  disabled={!currentValue.trim()}
                >
                  <Ionicons name="arrow-forward" size={moderateScale(20)} color="#6FFFE9" />
                </TouchableOpacity>
              </View>
            )}
            {/* Android: text input always visible; icon triggers modal */}
            {Platform.OS === 'android' && pickerVisible && (
              <DateTimePicker
                value={dateValue}
                mode="date"
                display="default"
                onChange={(_, selected) => {
                  setPickerVisible(false);
                  if (selected) {
                    setDateValue(selected);
                    const mo = String(selected.getMonth() + 1).padStart(2, '0');
                    const da = String(selected.getDate()).padStart(2, '0');
                    setCurrentValue(`${mo}/${da}/${selected.getFullYear()}`);
                    setDateError(null);
                  }
                }}
              />
            )}
            {!!dateError && <Text style={styles.errorText}>{dateError}</Text>}
          </View>
        )}

        {/* Time picker */}
        {inputType === 'time' && (
          <View style={styles.fieldWrapper}>
            {Platform.OS === 'ios' && pickerVisible ? (
              <View style={styles.textInputRow}>
                <View style={{ flex: 1 }}>
                  <DateTimePicker
                    value={dateValue}
                    mode="time"
                    display="spinner"
                    textColor="#ffffff"
                    themeVariant="dark"
                    onChange={(_, selected) => {
                      if (selected) {
                        setDateValue(selected);
                        const h = selected.getHours();
                        const min = selected.getMinutes();
                        const period = h >= 12 ? 'PM' : 'AM';
                        const hour12 = h % 12 === 0 ? 12 : h % 12;
                        setCurrentValue(`${hour12}:${String(min).padStart(2, '0')} ${period}`);
                        setDateError(null);
                      }
                    }}
                  />
                </View>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => setPickerVisible(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  focusable={false}
                >
                  <Ionicons name="keypad-outline" size={moderateScale(22)} color="rgba(111,255,233,0.7)" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sendButton, !currentValue.trim() && styles.sendButtonDisabled]}
                  onPress={handleNext}
                  disabled={!currentValue.trim()}
                >
                  <Ionicons name="arrow-forward" size={moderateScale(20)} color="#6FFFE9" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.textInputRow}>
                <View style={styles.inputWithIcon}>
                  <TextInput
                    ref={inputRef}
                    style={styles.inputInner}
                    value={currentValue}
                    onChangeText={onTimeTextChange}
                    placeholder="H:MM AM/PM"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    keyboardType="numbers-and-punctuation"
                    returnKeyType="next"
                    onSubmitEditing={handleNext}
                  />
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => { Keyboard.dismiss(); setPickerVisible(true); }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    focusable={false}
                  >
                    <Ionicons name="time-outline" size={moderateScale(22)} color="rgba(255,255,255,0.55)" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.sendButton, !currentValue.trim() && styles.sendButtonDisabled]}
                  onPress={handleNext}
                  disabled={!currentValue.trim()}
                >
                  <Ionicons name="arrow-forward" size={moderateScale(20)} color="#6FFFE9" />
                </TouchableOpacity>
              </View>
            )}
            {Platform.OS === 'android' && pickerVisible && (
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
                    const period = h >= 12 ? 'PM' : 'AM';
                    const hour12 = h % 12 === 0 ? 12 : h % 12;
                    setCurrentValue(`${hour12}:${String(min).padStart(2, '0')} ${period}`);
                    setDateError(null);
                  }
                }}
              />
            )}
            <TouchableOpacity style={[styles.choiceButton, { alignSelf: 'center' }]} onPress={handleSkipTime}>
              <Text style={styles.choiceText}>I don&apos;t know</Text>
            </TouchableOpacity>
            {!!dateError && <Text style={styles.errorText}>{dateError}</Text>}
          </View>
        )}

        {/* Text inputs */}
        {inputType === 'text' && (
          <View style={styles.textInputRow}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              value={currentValue}
              onChangeText={setCurrentValue}
              placeholder={placeholder ?? 'Type here…'}
              placeholderTextColor="rgba(255,255,255,0.4)"
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={handleNext}
            />
            <TouchableOpacity
              style={[styles.sendButton, !currentValue.trim() && styles.sendButtonDisabled]}
              onPress={handleNext}
              disabled={!currentValue.trim()}
            >
              <Ionicons name="arrow-forward" size={moderateScale(20)} color="#6FFFE9" />
            </TouchableOpacity>
          </View>
        )}

        {/* Password input */}
        {inputType === 'secure' && (
          <View style={styles.fieldWrapper}>
            <View style={styles.textInputRow}>
              <PasswordInput
                ref={inputRef}
                value={currentValue}
                onChangeText={(t) => { setCurrentValue(t); setPasswordError(null); }}
                placeholder={placeholder ?? 'Password…'}
                placeholderTextColor="rgba(255,255,255,0.4)"
                autoCapitalize="none"
                returnKeyType="next"
                onSubmitEditing={handleNext}
              />
              <TouchableOpacity
                style={[styles.sendButton, !currentValue.trim() && styles.sendButtonDisabled]}
                onPress={handleNext}
                disabled={!currentValue.trim()}
              >
                <Ionicons name="arrow-forward" size={moderateScale(20)} color="#6FFFE9" />
              </TouchableOpacity>
            </View>
            {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
          </View>
        )}

        {/* Email input */}
        {inputType === 'email' && (
          <View style={styles.fieldWrapper}>
            <View style={styles.textInputRow}>
              <TextInput
                ref={inputRef}
                style={styles.textInput}
                value={currentValue}
                onChangeText={(t) => { setCurrentValue(t); setEmailError(null); }}
                placeholder="Email address…"
                placeholderTextColor="rgba(255,255,255,0.4)"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={handleEmailNext}
              />
              <TouchableOpacity
                style={[styles.sendButton, !currentValue.trim() && styles.sendButtonDisabled]}
                onPress={handleEmailNext}
                disabled={!currentValue.trim()}
              >
                <Ionicons name="arrow-forward" size={moderateScale(20)} color="#6FFFE9" />
              </TouchableOpacity>
            </View>
            {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}
          </View>
        )}

        {/* Location search */}
        {inputType === 'location' && (
          <View style={styles.fieldWrapper}>
            <View style={styles.locationInputRow}>
              <TextInput
                ref={inputRef}
                style={[styles.textInput, styles.locationInput]}
                value={locationQuery}
                onChangeText={onLocationChange}
                placeholder={placeholder ?? 'Search city…'}
                placeholderTextColor="rgba(255,255,255,0.4)"
                autoCapitalize="words"
                returnKeyType="search"
              />
              <TouchableOpacity
                style={[styles.sendButton, (!selectedLocation || locationSearching || locationTzLoading) && styles.sendButtonDisabled]}
                onPress={handleLocationNext}
                disabled={!selectedLocation || locationSearching || locationTzLoading}
              >
                <Ionicons name="arrow-forward" size={moderateScale(20)} color="#6FFFE9" />
              </TouchableOpacity>
            </View>
            {locationResults.length > 0 && (
              <ScrollView
                style={styles.locationDrop}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {locationResults.map(r => (
                  <TouchableOpacity
                    key={r.place_id}
                    style={styles.locationRow}
                    onPress={() => selectLocation(r)}
                  >
                    <Text style={styles.locationRowText} numberOfLines={2}>{formatPlace(r)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={[styles.choiceButton, { alignSelf: 'center' }]} onPress={skipLocation}>
              <Text style={styles.choiceText}>I don&apos;t know</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Final step */}
        {inputType === 'final' && (
          <View style={styles.finalArea}>
            <View style={styles.policyRow}>
              <TouchableOpacity onPress={() => setCheckedTerms(v => !v)}>
                <View style={[styles.policyCheckbox, checkedTerms && styles.policyCheckboxChecked]}>
                  {checkedTerms && <Text style={styles.policyCheckmark}>✓</Text>}
                </View>
              </TouchableOpacity>
              <Text style={styles.policyText}>
                I agree to the{' '}
                <Text style={styles.policyLink} onPress={() => { setPolicyModalContent('Terms & Conditions'); setIsPolicyModalVisible(true); }}>
                  Terms &amp; Conditions
                </Text>
              </Text>
            </View>

            <View style={styles.policyRow}>
              <TouchableOpacity onPress={() => setCheckedPolicy(v => !v)}>
                <View style={[styles.policyCheckbox, checkedPolicy && styles.policyCheckboxChecked]}>
                  {checkedPolicy && <Text style={styles.policyCheckmark}>✓</Text>}
                </View>
              </TouchableOpacity>
              <Text style={styles.policyText}>
                I agree to the{' '}
                <Text style={styles.policyLink} onPress={() => { setPolicyModalContent('Privacy Policy'); setIsPolicyModalVisible(true); }}>
                  Privacy Policy
                </Text>
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.nextButton, (!checkedPolicy || !checkedTerms) && styles.nextButtonDisabled]}
              onPress={handleNext}
              disabled={!checkedPolicy || !checkedTerms}
            >
              <Text style={styles.nextButtonText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
    <PolicyModal
      visible={isPolicyModalVisible}
      onClose={() => setIsPolicyModalVisible(false)}
      title={policyModalContent}
      textContent={policyModalContent === 'Terms & Conditions' ? termsAndConditions : privacyPolicy}
    />
  </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(24),
    paddingBottom: verticalScale(16),
  },
  // ── Chat bubbles ──
  chatPair: {
    marginBottom: verticalScale(20),
  },
  questionBubble: {
    backgroundColor: 'rgba(111,255,233,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(111,255,233,0.3)',
    borderRadius: moderateScale(16),
    padding: scale(16),
    alignSelf: 'flex-start',
    maxWidth: '85%',
    marginBottom: verticalScale(8),
  },
  questionText: {
    color: '#ffffff',
    fontSize: moderateScale(16),
    lineHeight: moderateScale(24),
  },
  answerBubble: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(111,255,233,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(111,255,233,0.5)',
    borderRadius: moderateScale(16),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    maxWidth: '75%',
  },
  answerText: {
    color: '#ffffff',
    fontSize: moderateScale(15),
  },
  // ── Input area (fixed bottom) ──
  inputArea: {
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(10),
    gap: verticalScale(8),
  },
  fieldWrapper: {
    gap: verticalScale(6),
  },
  choicesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(8),
    justifyContent: 'center',
  },
  choiceButton: {
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(24),
    borderWidth: 1,
    borderColor: '#6FFFE9',
    backgroundColor: 'rgba(111,255,233,0.08)',
  },
  choiceSelected: {
    backgroundColor: 'rgba(111,255,233,0.3)',
  },
  choiceText: {
    color: '#6FFFE9',
    fontSize: moderateScale(15),
    fontWeight: '500',
  },
  pickerWrapper: {
    alignItems: 'center',
    gap: verticalScale(16),
  },
  textInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  textInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(111,255,233,0.4)',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    color: '#ffffff',
    fontSize: moderateScale(16),
  },
  sendButton: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(22),
    backgroundColor: 'rgba(111,255,233,0.15)',
    borderWidth: 1,
    borderColor: '#b3bbba',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
  nextButton: {
    backgroundColor: 'rgba(111,255,233,0.12)',
    borderWidth: 1,
    borderColor: '#6FFFE9',
    borderRadius: moderateScale(30),
    paddingHorizontal: scale(32),
    paddingVertical: verticalScale(14),
    alignSelf: 'center',
  },
  nextButtonText: {
    color: '#6FFFE9',
    fontSize: moderateScale(17),
    fontWeight: '600',
  },
  locationInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  locationInput: {
    flex: 1,
  },
  locationDrop: {
    maxHeight: verticalScale(180),
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: 'rgba(111,255,233,0.3)',
  },
  locationRow: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(111,255,233,0.1)',
  },
  locationRowText: {
    color: '#ffffff',
    fontSize: moderateScale(14),
    lineHeight: moderateScale(20),
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: moderateScale(13),
    textAlign: 'center',
  },
  iconButton: {
    paddingHorizontal: scale(8),
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWithIcon: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(111,255,233,0.4)',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(16),
  },
  inputInner: {
    flex: 1,
    paddingVertical: verticalScale(12),
    color: '#ffffff',
    fontSize: moderateScale(16),
  },
  finalArea: {
    gap: verticalScale(12),
    paddingVertical: verticalScale(8),
  },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    paddingHorizontal: scale(4),
  },
  policyCheckbox: {
    width: scale(22),
    height: scale(22),
    borderRadius: scale(4),
    borderWidth: 2,
    borderColor: '#6FFFE9',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  policyCheckboxChecked: {
    backgroundColor: '#6FFFE9',
  },
  policyCheckmark: {
    color: '#0a0a0a',
    fontWeight: 'bold',
    fontSize: moderateScale(13),
  },
  policyText: {
    color: '#ffffff',
    fontSize: moderateScale(14),
    flex: 1,
  },
  policyLink: {
    color: '#6FFFE9',
    textDecorationLine: 'underline',
  },
  nextButtonDisabled: {
    opacity: 0.35,
  },
});
