import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';
import {
  NominatimResult,
  formatPlace,
  searchNominatim,
  detectTimezoneOffset,
} from '@/src/utils/location';

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

interface ChatFlowProps {
  steps: StepConfig[];
  onComplete: (answers: Record<string, any>) => void;
  step: number;
  setStep: (n: number) => void;
  keyboardOffset?: number;
}

// Fallback coords (Greenwich) when location is unknown
const FALLBACK_LAT = 51.4779;
const FALLBACK_LON = 0.0015;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatFlow({
  steps,
  onComplete,
  step,
  setStep,
  keyboardOffset = 0,
}: ChatFlowProps) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentValue, setCurrentValue] = useState('');
  const [dateValue, setDateValue] = useState(new Date());

  // Location search state
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState<NominatimResult[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationTzLoading, setLocationTzLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputRef = useRef<TextInput>(null);

  const currentStep = steps[step];
  if (!currentStep) return null;

  const advance = (updatedAnswers: Record<string, any>) => {
    setAnswers(updatedAnswers);
    setCurrentValue('');
    setDateValue(new Date());
    setLocationQuery('');
    setLocationResults([]);
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete(updatedAnswers);
    }
  };

  // ── Standard next ─────────────────────────────────────────────────────────

  const handleNext = () => {
    const { key, inputType } = currentStep;
    if (inputType === 'final') { onComplete(answers); return; }
    let value: any = currentValue;
    if (inputType === 'date') {
      const yyyy = dateValue.getFullYear();
      const mm = String(dateValue.getMonth() + 1).padStart(2, '0');
      const dd = String(dateValue.getDate()).padStart(2, '0');
      value = `${yyyy}-${mm}-${dd}`;
    } else if (inputType === 'time') {
      const hh = String(dateValue.getHours()).padStart(2, '0');
      const min = String(dateValue.getMinutes()).padStart(2, '0');
      value = `${hh}:${min}`;
    }
    advance({ ...answers, [key]: value });
  };

  const handleSkipTime = () => {
    advance({ ...answers, [currentStep.key]: null, isBirthTimeUnknown: true });
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
    setLocationTzLoading(true);
    const tz = await detectTimezoneOffset(lat, lon, birthDate);
    setLocationTzLoading(false);
    advance({
      ...answers,
      [currentStep.key]: label,
      birthLat: lat,
      birthLon: lon,
      birthTimezone: tz,   // numeric UTC offset (e.g. -5 for EST)
      isPlaceOfBirthUnknown: false,
    });
  };

  const skipLocation = () => {
    advance({
      ...answers,
      [currentStep.key]: null,
      birthLat: FALLBACK_LAT,
      birthLon: FALLBACK_LON,
      birthTimezone: 0,
      isPlaceOfBirthUnknown: true,
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const { inputType, placeholder, choices } = currentStep;
  const question = QUESTIONS[currentStep.key]?.(answers) ?? '';
  const isTextType = ['text', 'email', 'secure'].includes(inputType);

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: keyboardOffset + verticalScale(32) }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Question bubble */}
      <View style={styles.questionBubble}>
        <Text style={styles.questionText}>{question}</Text>
      </View>

      {/* Input area */}
      <View style={styles.inputArea}>

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

        {/* Date / Time picker */}
        {(inputType === 'date' || inputType === 'time') && (
          <View style={styles.pickerWrapper}>
            <DateTimePicker
              value={dateValue}
              mode={inputType}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              textColor="#ffffff"
              themeVariant="dark"
              onChange={(_, selected) => selected && setDateValue(selected)}
            />
            <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
              <Text style={styles.nextButtonText}>Next →</Text>
            </TouchableOpacity>
            {inputType === 'time' && (
              <TouchableOpacity style={styles.skipButton} onPress={handleSkipTime}>
                <Text style={styles.skipButtonText}>I don't know my birth time</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Text inputs */}
        {isTextType && (
          <View style={styles.textInputRow}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              value={currentValue}
              onChangeText={setCurrentValue}
              placeholder={placeholder ?? 'Type here…'}
              placeholderTextColor="rgba(255,255,255,0.4)"
              keyboardType={inputType === 'email' ? 'email-address' : 'default'}
              secureTextEntry={inputType === 'secure'}
              autoCapitalize={['email', 'secure'].includes(inputType) ? 'none' : 'words'}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={handleNext}
            />
            <TouchableOpacity
              style={[styles.sendButton, !currentValue.trim() && styles.sendButtonDisabled]}
              onPress={handleNext}
              disabled={!currentValue.trim()}
            >
              <Text style={styles.sendButtonText}>→</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Location search with Nominatim geocoding */}
        {inputType === 'location' && (
          <View style={styles.locationWrapper}>
            <View style={styles.locationInputRow}>
              <TextInput
                style={[styles.textInput, styles.locationInput]}
                value={locationQuery}
                onChangeText={onLocationChange}
                placeholder={placeholder ?? 'Search city…'}
                placeholderTextColor="rgba(255,255,255,0.4)"
                autoCapitalize="words"
                autoFocus
                returnKeyType="search"
              />
              {(locationSearching || locationTzLoading) && (
                <ActivityIndicator
                  style={styles.locationSpinner}
                  size="small"
                  color="#6FFFE9"
                />
              )}
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
                    <Text style={styles.locationRowText} numberOfLines={2}>
                      {formatPlace(r)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.skipButton} onPress={skipLocation}>
              <Text style={styles.skipButtonText}>I don't know where I was born</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Final step */}
        {inputType === 'final' && (
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>Get Started ✨</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(24),
    justifyContent: 'space-between',
  },
  questionBubble: {
    backgroundColor: 'rgba(111,255,233,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(111,255,233,0.3)',
    borderRadius: moderateScale(16),
    padding: scale(16),
    marginBottom: verticalScale(32),
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  questionText: {
    color: '#ffffff',
    fontSize: moderateScale(16),
    lineHeight: moderateScale(24),
  },
  inputArea: {
    gap: verticalScale(12),
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
    borderColor: '#6FFFE9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
  sendButtonText: {
    color: '#6FFFE9',
    fontSize: moderateScale(20),
    fontWeight: '700',
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
  skipButton: {
    alignSelf: 'center',
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(16),
  },
  skipButtonText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: moderateScale(13),
    textDecorationLine: 'underline',
  },
  locationWrapper: {
    gap: verticalScale(8),
  },
  locationInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  locationInput: {
    flex: 1,
    marginBottom: 0,
  },
  locationSpinner: {
    marginLeft: scale(4),
  },
  locationDrop: {
    maxHeight: verticalScale(200),
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
});
