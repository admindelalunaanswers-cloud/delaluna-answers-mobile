import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { updateEmail } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';

import { ThemeContext } from '@/src/context/theme-context';
import { useUser } from '@/src/context/user-context';
import { updateUserDoc, isAdminEmail } from '@/src/services/user.service';
import { calculateNatalChart, calculateTransits, BirthData } from '@/src/services/astroEngine';
import { requestBreakdown } from '@/src/services/natal-chart-breakdown.service';
import { requestHoroscope, getTodayDateId } from '@/src/services/horoscope.service';
import { requestTransitReading } from '@/src/services/transit-reading.service';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';
import { auth, db } from '@/firebaseConfig';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';
import {
  NominatimResult,
  formatPlace,
  searchNominatim,
  detectTimezoneOffset,
} from '@/src/utils/location';
import LoadingScreen from '../(util)/loading-screen';

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_LAT = 51.4779;
const FALLBACK_LON = 0.0015;
const PRONOUNS = ['She/Her', 'He/Him', 'They/Them', 'Non Binary'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateDisplay(dateId: string): string {
  if (!dateId) return '';
  const [y, m, d] = dateId.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function formatTimeDisplay(time: string): string {
  if (!time) return '';
  const [h, min] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(min).padStart(2, '0')} ${period}`;
}

/** Normalize a birthday value that may be a string, Firestore Timestamp, or JS Date. */
function normalizeBirthday(value: any): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const d = value.toDate() as Date;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return String(value);
}

interface ChartFields {
  birthday: string;
  birthtime: string;
  birthLat: number;
  birthLon: number;
  birthTimezone: number;
  isBirthTimeUnknown: boolean;
  isPlaceOfBirthUnknown: boolean;
}

/** Returns true only if the new values would produce a different natal chart. */
function chartNeedsRecalculation(orig: ChartFields, next: ChartFields): boolean {
  if (orig.birthday !== next.birthday) return true;
  if (orig.isBirthTimeUnknown !== next.isBirthTimeUnknown) return true;
  if (!next.isBirthTimeUnknown && orig.birthtime !== next.birthtime) return true;
  if (orig.isPlaceOfBirthUnknown !== next.isPlaceOfBirthUnknown) return true;
  if (!next.isPlaceOfBirthUnknown) {
    if (orig.birthLat !== next.birthLat) return true;
    if (orig.birthLon !== next.birthLon) return true;
    if (orig.birthTimezone !== next.birthTimezone) return true;
  }
  return false;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const router = useRouter();
  const { theme } = useContext(ThemeContext);
  const { authUser, userDoc, refresh } = useUser();
  const ud = userDoc as any;

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Saving changes...');
  const [confirmVisible, setConfirmVisible] = useState(false);

  // Personal info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [pronouns, setPronouns]   = useState('');
  const [email, setEmail]         = useState('');

  // Birth fields
  const [birthday, setBirthday]                         = useState('');
  const [birthtime, setBirthtime]                       = useState('');
  const [birthLat, setBirthLat]                         = useState(FALLBACK_LAT);
  const [birthLon, setBirthLon]                         = useState(FALLBACK_LON);
  const [birthTimezone, setBirthTimezone]               = useState(0);
  const [placeOfBirth, setPlaceOfBirth]                 = useState<string | null>(null);
  const [isBirthTimeUnknown, setIsBirthTimeUnknown]     = useState(false);
  const [isPlaceOfBirthUnknown, setIsPlaceOfBirthUnknown] = useState(false);

  // Date / time picker
  const [pickerMode, setPickerMode]     = useState<'date' | 'time'>('date');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerDate, setPickerDate]     = useState(new Date());

  // Location search
  const [locationQuery, setLocationQuery]           = useState('');
  const [locationResults, setLocationResults]       = useState<NominatimResult[]>([]);
  const [locationSearching, setLocationSearching]   = useState(false);
  const [locationTzLoading, setLocationTzLoading]   = useState(false);
  const [selectedLocation, setSelectedLocation]     = useState<{
    label: string; lat: number; lon: number; tz: number;
  } | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Snapshot of original chart-affecting values (for change detection)
  const [originalValues, setOriginalValues] = useState<ChartFields | null>(null);

  // ── Load user data on mount ────────────────────────────────────────────────

  useEffect(() => {
    if (!ud) return;

    const fn = ud.firstName ?? (ud.name ? String(ud.name).split(' ')[0] : '');
    const ln = ud.lastName  ?? (ud.name ? String(ud.name).split(' ').slice(1).join(' ') : '');
    setFirstName(fn);
    setLastName(ln);
    setPronouns(ud.pronouns ?? '');
    setEmail(ud.email ?? authUser?.email ?? '');

    const bd = normalizeBirthday(ud.birthday);
    setBirthday(bd);

    const bt = ud.birthtime ?? '';
    setBirthtime(bt);

    const lat = ud.birthLat ?? FALLBACK_LAT;
    const lon = ud.birthLon ?? FALLBACK_LON;
    const tz  = ud.birthTimezone ?? ud.timezone ?? 0;
    setBirthLat(lat);
    setBirthLon(lon);
    setBirthTimezone(tz);

    const place = ud.placeOfBirth ?? ud.birthplace ?? null;
    setPlaceOfBirth(place);

    const timeUnknown  = ud.isBirthTimeUnknown ?? !bt;
    const placeUnknown = ud.isPlaceOfBirthUnknown ?? !place;
    setIsBirthTimeUnknown(timeUnknown);
    setIsPlaceOfBirthUnknown(placeUnknown);

    if (place && !placeUnknown) {
      setLocationQuery(place);
      setSelectedLocation({ label: place, lat, lon, tz });
    }

    setOriginalValues({
      birthday: bd,
      birthtime: bt,
      birthLat: lat,
      birthLon: lon,
      birthTimezone: tz,
      isBirthTimeUnknown: timeUnknown,
      isPlaceOfBirthUnknown: placeUnknown,
    });
  }, [userDoc]);

  // ── Location search ────────────────────────────────────────────────────────

  const handleLocationSearch = (query: string) => {
    setLocationQuery(query);
    setSelectedLocation(null);
    setLocationResults([]);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim()) return;
    setLocationSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchNominatim(query);
        setLocationResults(results.slice(0, 5));
      } catch {
        setLocationResults([]);
      } finally {
        setLocationSearching(false);
      }
    }, 600);
  };

  const selectLocation = async (r: NominatimResult) => {
    const label = formatPlace(r);
    const lat   = parseFloat(r.lat);
    const lon   = parseFloat(r.lon);
    setLocationResults([]);
    setLocationQuery(label);
    setLocationTzLoading(true);
    try {
      const birthDate = birthday
        ? (() => { const [y, m, d] = birthday.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); })()
        : new Date();
      const tz = await detectTimezoneOffset(lat, lon, birthDate);
      setSelectedLocation({ label, lat, lon, tz });
      setPlaceOfBirth(label);
      setBirthLat(lat);
      setBirthLon(lon);
      setBirthTimezone(tz);
    } catch {
      setSelectedLocation({ label, lat, lon, tz: 0 });
      setPlaceOfBirth(label);
      setBirthLat(lat);
      setBirthLon(lon);
      setBirthTimezone(0);
    } finally {
      setLocationTzLoading(false);
    }
  };

  // ── Date / time picker ─────────────────────────────────────────────────────

  const openDatePicker = () => {
    Keyboard.dismiss();
    if (birthday) {
      const [y, m, d] = birthday.split('-').map(Number);
      setPickerDate(new Date(y, m - 1, d));
    } else {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 25);
      setPickerDate(d);
    }
    setPickerMode('date');
    setPickerVisible(true);
  };

  const openTimePicker = () => {
    Keyboard.dismiss();
    if (birthtime) {
      const [h, m] = birthtime.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      setPickerDate(d);
    } else {
      setPickerDate(new Date());
    }
    setPickerMode('time');
    setPickerVisible(true);
  };

  const handlePickerChange = (_: any, selected?: Date) => {
    if (Platform.OS === 'android') setPickerVisible(false);
    if (!selected) return;
    if (pickerMode === 'date') {
      const y = selected.getFullYear();
      const m = String(selected.getMonth() + 1).padStart(2, '0');
      const d = String(selected.getDate()).padStart(2, '0');
      setBirthday(`${y}-${m}-${d}`);
      setPickerDate(selected);
    } else {
      const h   = String(selected.getHours()).padStart(2, '0');
      const min = String(selected.getMinutes()).padStart(2, '0');
      setBirthtime(`${h}:${min}`);
      setPickerDate(selected);
    }
  };

  const confirmPickerIOS = () => setPickerVisible(false);

  // ── Save logic ─────────────────────────────────────────────────────────────

  const handleSavePress = () => {
    if (!firstName.trim()) {
      Alert.alert('Name required', 'Please enter your first name.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (!birthday) {
      Alert.alert('Birthday required', 'Please enter your birthday.');
      return;
    }
    if (!isPlaceOfBirthUnknown && !selectedLocation) {
      Alert.alert('Birth place required', 'Please search for and select your place of birth, or tap "I don\'t know".');
      return;
    }

    const next: ChartFields = {
      birthday,
      birthtime: isBirthTimeUnknown ? '12:00' : birthtime,
      birthLat:  isPlaceOfBirthUnknown ? FALLBACK_LAT : birthLat,
      birthLon:  isPlaceOfBirthUnknown ? FALLBACK_LON : birthLon,
      birthTimezone: isPlaceOfBirthUnknown ? 0 : birthTimezone,
      isBirthTimeUnknown,
      isPlaceOfBirthUnknown,
    };

    if (originalValues && chartNeedsRecalculation(originalValues, next)) {
      const changeCount = ud?.birthDetailsChangeCount ?? 0;
      if (changeCount >= 3) {
        Alert.alert(
          'Change limit reached',
          'Birth details can only be updated 3 times. Please contact support if you need further changes.',
        );
        return;
      }
      setConfirmVisible(true);
    } else {
      void performSave(false);
    }
  };

  const performSave = async (recalcChart: boolean) => {
    setConfirmVisible(false);
    setIsLoading(true);
    setLoadingMessage('Saving changes...');

    const uid = authUser?.uid;
    if (!uid) {
      setIsLoading(false);
      Alert.alert('Error', 'Not signed in.');
      return;
    }

    const effectiveLat  = isPlaceOfBirthUnknown ? FALLBACK_LAT : birthLat;
    const effectiveLon  = isPlaceOfBirthUnknown ? FALLBACK_LON : birthLon;
    const effectiveTz   = isPlaceOfBirthUnknown ? 0 : birthTimezone;
    const effectiveTime = isBirthTimeUnknown ? null : (birthtime || null);

    try {
      const displayName  = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
      const trimmedEmail = email.trim().toLowerCase();
      const currentEmail = (ud?.email ?? authUser?.email ?? '').toLowerCase();
      const emailChanged = trimmedEmail !== currentEmail;

      // Update Firebase Auth email if changed
      if (emailChanged && auth.currentUser) {
        try {
          await updateEmail(auth.currentUser, trimmedEmail);
        } catch (err: any) {
          if (err?.code === 'auth/requires-recent-login') {
            Alert.alert('Re-authentication required', 'Please log out and log back in to change your email.');
          } else if (err?.code === 'auth/email-already-in-use') {
            Alert.alert('Email in use', 'That email is already registered to another account.');
          } else {
            Alert.alert('Email update failed', err?.message ?? 'Could not update email.');
          }
          setIsLoading(false);
          return;
        }
      }

      await updateUserDoc(uid, {
        name:                  displayName,
        fullName:              displayName,
        birthday:              birthday,
        birthtime:             effectiveTime ?? '12:00',
        birthLat:              effectiveLat,
        birthLon:              effectiveLon,
        ...({
          firstName:            firstName.trim(),
          lastName:             lastName.trim(),
          pronouns,
          email:                trimmedEmail,
          isAdmin:              isAdminEmail(trimmedEmail),
          birthTimezone:        effectiveTz,
          placeOfBirth:         isPlaceOfBirthUnknown ? null : placeOfBirth,
          isBirthTimeUnknown,
          isPlaceOfBirthUnknown,
          ...(recalcChart ? { birthDetailsChangeCount: (ud?.birthDetailsChangeCount ?? 0) + 1 } : {}),
        } as any),
      } as any);

      if (recalcChart) {
        setLoadingMessage('Recalculating your birth chart...');

        const [year, month, day] = birthday.split('-').map(Number);
        const [hour, minute] = effectiveTime
          ? effectiveTime.split(':').map(Number)
          : [12, 0];

        const bd: BirthData = {
          year, month, day, hour, minute,
          lat: effectiveLat,
          lon: effectiveLon,
          timezone: effectiveTz,
        };

        const natalChart = await calculateNatalChart(bd);
        const chartPlanets = natalChart.planets.map(
          ({ name, symbol, longitude, sign, signSymbol, degree, minutes, seconds, speed, isRetrograde, house }) =>
            ({ name, symbol, longitude, sign, signSymbol, degree, minutes, seconds, speed, isRetrograde, house })
        );
        const chartPayload = {
          createdAt: serverTimestamp(),
          planets:   chartPlanets,
          houses:    natalChart.houses,
          moon:      natalChart.moon,
          ascendant: natalChart.ascendant,
          midheaven: natalChart.midheaven,
          tier: 'free',
        };

        // Save to both locations — overwrite entirely (birth data changed)
        await setDoc(doc(db, 'users', uid, 'chartData', 'details'), chartPayload);
        await setDoc(doc(db, 'users', uid, 'birthChart', 'data'), chartPayload);

        setLoadingMessage('Regenerating your readings...');

        const chartDetailsDoc: NatalChartDetailsDoc = {
          createdAt: null as any,
          planets:   chartPlanets,
          houses:    natalChart.houses,
          moon:      natalChart.moon,
          ascendant: natalChart.ascendant,
          midheaven: natalChart.midheaven,
        };

        const dateId = getTodayDateId();
        // Birthday change is the only trigger for horoscope regeneration.
        // Breakdown and transits regenerate whenever any chart field changes.
        const birthdayChanged = originalValues !== null && originalValues.birthday !== birthday;

        // Breakdown always regenerates on any natal chart change
        requestBreakdown(uid, chartDetailsDoc).catch(console.error);

        calculateTransits(new Date(), bd.lat, bd.lon)
          .then(transits => {
            const retrogrades = transits.planets.filter(p => p.isRetrograde).map(p => p.name);
            // Transit reading always regenerates (accuracy / personalization)
            requestTransitReading(uid, dateId, chartDetailsDoc, transits, 'free').catch(console.error);
            // Horoscopes only regenerate when the birthday itself changed;
            // tarot cards are preserved (skipTarotDraw: true)
            if (birthdayChanged) {
              requestHoroscope(uid, dateId, chartDetailsDoc, transits.moon, retrogrades, { skipTarotDraw: true })
                .catch(console.error);
            }
          })
          .catch(() => {
            if (birthdayChanged) {
              requestHoroscope(uid, dateId, chartDetailsDoc, natalChart.moon, [], { skipTarotDraw: true })
                .catch(console.error);
            }
          });
      }

      await refresh();
      setIsLoading(false);

      Alert.alert(
        'Profile updated',
        recalcChart
          ? 'Your birth chart has been recalculated and your readings are regenerating in the background.'
          : 'Your profile has been updated.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err: any) {
      console.error('EditProfile save error:', err);
      setIsLoading(false);
      Alert.alert('Error', err?.message ?? 'Failed to save changes. Please try again.');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <LoadingScreen message={loadingMessage} />;
  }

  return (
    <ImageBackground source={theme.backgroundImage} style={ss.bg} resizeMode="cover">
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <BlurView intensity={15} tint="dark" style={ss.overlay}>

        {/* Header */}
        <View style={ss.header}>
          <TouchableOpacity onPress={() => router.back()} style={ss.headerSide}>
            <Ionicons name="chevron-back" size={scale(22)} color="#6FFFE9" />
            <Text style={ss.headerBack}>Back</Text>
          </TouchableOpacity>

          <Text style={ss.headerTitle}>Edit Profile</Text>

          <TouchableOpacity onPress={handleSavePress} style={ss.headerSide}>
            <Text style={ss.headerSave}>Save</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView
              style={ss.scroll}
              contentContainerStyle={ss.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* ── Personal Info ── */}
              <Text style={ss.sectionTitle}>Personal Info</Text>

              <Text style={ss.fieldLabel}>First Name</Text>
              <TextInput
                style={ss.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                placeholderTextColor="rgba(255,255,255,0.35)"
                autoCorrect={false}
              />

              <Text style={ss.fieldLabel}>Last Name</Text>
              <TextInput
                style={ss.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
                placeholderTextColor="rgba(255,255,255,0.35)"
                autoCorrect={false}
              />

              <Text style={ss.fieldLabel}>Pronouns</Text>
              <View style={ss.choicesRow}>
                {PRONOUNS.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[ss.chip, pronouns === p && ss.chipActive]}
                    onPress={() => setPronouns(p)}
                  >
                    <Text style={[ss.chipText, pronouns === p && ss.chipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={ss.fieldLabel}>Email</Text>
              <TextInput
                style={ss.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Email address"
                placeholderTextColor="rgba(255,255,255,0.35)"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />

              {/* ── Birth Details ── */}
              <Text style={[ss.sectionTitle, { marginTop: verticalScale(28) }]}>Birth Details</Text>
              <Text style={ss.sectionNote}>
                Changes here will recalculate your natal chart and regenerate your readings.
              </Text>

              {/* Birthday */}
              <Text style={ss.fieldLabel}>Birthday</Text>
              <TouchableOpacity style={ss.inputTouchable} onPress={openDatePicker} activeOpacity={0.75}>
                <Text style={birthday ? ss.inputText : ss.inputPlaceholder}>
                  {birthday ? formatDateDisplay(birthday) : 'Select date…'}
                </Text>
                <Ionicons name="calendar-outline" size={scale(18)} color="rgba(255,255,255,0.45)" />
              </TouchableOpacity>

              {/* Birth Time */}
              <Text style={ss.fieldLabel}>Birth Time</Text>
              {isBirthTimeUnknown ? (
                <View style={ss.inputRow}>
                  <Text style={ss.mutedText}>I don't know my birth time</Text>
                  <TouchableOpacity onPress={() => setIsBirthTimeUnknown(false)}>
                    <Text style={ss.linkText}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={ss.inputRow}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={openTimePicker} activeOpacity={0.75}>
                    <Text style={birthtime ? ss.inputText : ss.inputPlaceholder}>
                      {birthtime ? formatTimeDisplay(birthtime) : 'Select time…'}
                    </Text>
                  </TouchableOpacity>
                  <Ionicons
                    name="time-outline"
                    size={scale(18)}
                    color="rgba(255,255,255,0.45)"
                    style={{ marginRight: scale(8) }}
                  />
                  <TouchableOpacity onPress={() => { setIsBirthTimeUnknown(true); setBirthtime(''); }}>
                    <Text style={ss.dimLinkText}>I don't know</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Place of Birth */}
              <Text style={ss.fieldLabel}>Place of Birth</Text>
              {isPlaceOfBirthUnknown ? (
                <View style={ss.inputRow}>
                  <Text style={ss.mutedText}>I don't know my birth place</Text>
                  <TouchableOpacity onPress={() => {
                    setIsPlaceOfBirthUnknown(false);
                    setLocationQuery('');
                    setSelectedLocation(null);
                  }}>
                    <Text style={ss.linkText}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <View style={ss.inputRow}>
                    <TextInput
                      style={[ss.inputText, { flex: 1 }]}
                      value={locationQuery}
                      onChangeText={handleLocationSearch}
                      placeholder="Search city…"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      autoCorrect={false}
                    />
                    {(locationSearching || locationTzLoading) ? (
                      <ActivityIndicator size="small" color="#6FFFE9" style={{ marginRight: scale(8) }} />
                    ) : selectedLocation ? (
                      <Ionicons name="checkmark-circle" size={scale(18)} color="#6FFFE9" style={{ marginRight: scale(8) }} />
                    ) : null}
                    <TouchableOpacity onPress={() => {
                      setIsPlaceOfBirthUnknown(true);
                      setLocationQuery('');
                      setSelectedLocation(null);
                      setLocationResults([]);
                    }}>
                      <Text style={ss.dimLinkText}>I don't know</Text>
                    </TouchableOpacity>
                  </View>

                  {locationResults.length > 0 && (
                    <View style={ss.locationDropdown}>
                      {locationResults.map((r, i) => (
                        <TouchableOpacity
                          key={i}
                          style={[ss.locationItem, i > 0 && ss.locationItemBorder]}
                          onPress={() => { void selectLocation(r); }}
                        >
                          <Text style={ss.locationItemText}>{formatPlace(r)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <View style={{ height: verticalScale(60) }} />
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>

        {/* Android native date/time picker */}
        {Platform.OS === 'android' && pickerVisible && (
          <DateTimePicker
            value={pickerDate}
            mode={pickerMode}
            display="default"
            onChange={handlePickerChange}
            maximumDate={pickerMode === 'date' ? new Date() : undefined}
          />
        )}
      </BlurView>

      {/* iOS date/time picker — bottom sheet modal */}
      {Platform.OS === 'ios' && pickerVisible && (
        <Modal
          transparent
          animationType="slide"
          visible={pickerVisible}
          onRequestClose={() => setPickerVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setPickerVisible(false)}>
            <View style={ss.pickerOverlay}>
              <TouchableWithoutFeedback>
                <View style={ss.pickerSheet}>
                  <View style={ss.pickerSheetHeader}>
                    <TouchableOpacity onPress={() => setPickerVisible(false)}>
                      <Text style={ss.pickerCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={confirmPickerIOS}>
                      <Text style={ss.pickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={pickerDate}
                    mode={pickerMode}
                    display="spinner"
                    textColor="#ffffff"
                    themeVariant="dark"
                    onChange={handlePickerChange}
                    maximumDate={pickerMode === 'date' ? new Date() : undefined}
                    style={{ height: verticalScale(200) }}
                  />
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Confirm natal chart recalculation */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={ss.confirmOverlay}>
          <View style={ss.confirmCard}>
            <Text style={ss.confirmTitle}>Recalculate natal chart?</Text>
            <Text style={ss.confirmBody}>
              You've updated birth details that affect your natal chart. Saving will
              recalculate your chart and regenerate all your readings.{'\n\n'}
              {3 - (ud?.birthDetailsChangeCount ?? 0)} of 3 birth detail {3 - (ud?.birthDetailsChangeCount ?? 0) === 1 ? 'change' : 'changes'} remaining.
            </Text>
            <View style={ss.confirmActions}>
              <TouchableOpacity
                onPress={() => setConfirmVisible(false)}
                style={[ss.confirmBtn, ss.btnGhost]}
              >
                <Text style={ss.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { void performSave(true); }}
                style={[ss.confirmBtn, ss.btnPrimary]}
              >
                <Text style={ss.btnPrimaryText}>Yes, update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  bg:      { flex: 1 },
  overlay: {
    flex: 1,
    paddingTop: verticalScale(Platform.OS === 'ios' ? 58 : 38),
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingBottom: verticalScale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  headerSide: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: scale(60),
  },
  headerBack: {
    color: '#6FFFE9',
    fontSize: moderateScale(16),
    fontWeight: '500',
    marginLeft: scale(2),
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: moderateScale(18),
    fontWeight: '700',
  },
  headerSave: {
    color: '#6FFFE9',
    fontSize: moderateScale(16),
    fontWeight: '700',
    textAlign: 'right',
    minWidth: scale(60),
  },

  // Scroll
  scroll:       { flex: 1 },
  scrollContent: {
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(20),
  },

  // Section
  sectionTitle: {
    color: '#6FFFE9',
    fontSize: moderateScale(13),
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: verticalScale(12),
  },
  sectionNote: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: moderateScale(12),
    lineHeight: moderateScale(17),
    marginBottom: verticalScale(14),
    marginTop: verticalScale(-6),
  },

  // Field
  fieldLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: moderateScale(13),
    fontWeight: '600',
    marginBottom: verticalScale(6),
    marginTop: verticalScale(14),
  },

  // Input variants
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(111,255,233,0.3)',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(13),
    color: '#ffffff',
    fontSize: moderateScale(15),
  },
  inputTouchable: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(111,255,233,0.3)',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(13),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputRow: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(111,255,233,0.3)',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(13),
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputText: {
    color: '#ffffff',
    fontSize: moderateScale(15),
  },
  inputPlaceholder: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: moderateScale(15),
  },
  mutedText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: moderateScale(14),
    flex: 1,
  },
  linkText: {
    color: '#6FFFE9',
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  dimLinkText: {
    color: 'rgba(111,255,233,0.6)',
    fontSize: moderateScale(13),
  },

  // Pronouns chips
  choicesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(8),
  },
  chip: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(7),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chipActive: {
    borderColor: '#6FFFE9',
    backgroundColor: 'rgba(111,255,233,0.15)',
  },
  chipText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: moderateScale(13),
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#6FFFE9',
    fontWeight: '700',
  },

  // Location dropdown
  locationDropdown: {
    marginTop: verticalScale(4),
    borderRadius: moderateScale(10),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(111,255,233,0.2)',
    backgroundColor: 'rgba(10,10,28,0.95)',
  },
  locationItem: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
  },
  locationItemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  locationItemText: {
    color: '#e0e0f0',
    fontSize: moderateScale(14),
  },

  // iOS date picker sheet
  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerSheet: {
    backgroundColor: '#1c1c2e',
    borderTopLeftRadius: moderateScale(16),
    borderTopRightRadius: moderateScale(16),
    paddingBottom: verticalScale(24),
  },
  pickerSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  pickerCancel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: moderateScale(16),
  },
  pickerDone: {
    color: '#6FFFE9',
    fontSize: moderateScale(16),
    fontWeight: '700',
  },

  // Confirmation modal
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(24),
  },
  confirmCard: {
    backgroundColor: 'rgba(16,16,36,0.97)',
    borderRadius: moderateScale(16),
    paddingVertical: verticalScale(20),
    paddingHorizontal: scale(20),
    borderWidth: 1,
    borderColor: 'rgba(111,255,233,0.2)',
    width: '100%',
    maxWidth: scale(420),
  },
  confirmTitle: {
    color: '#ffffff',
    fontSize: moderateScale(18),
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: verticalScale(10),
  },
  confirmBody: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: moderateScale(14),
    textAlign: 'center',
    lineHeight: moderateScale(20),
    marginBottom: verticalScale(20),
  },
  confirmActions: {
    flexDirection: 'row',
    gap: scale(12),
    justifyContent: 'center',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: verticalScale(11),
    borderRadius: moderateScale(10),
    alignItems: 'center',
  },
  btnGhost: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  btnGhostText: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    fontSize: moderateScale(15),
  },
  btnPrimary: {
    backgroundColor: 'rgba(111,255,233,0.2)',
    borderWidth: 1,
    borderColor: '#6FFFE9',
  },
  btnPrimaryText: {
    color: '#6FFFE9',
    fontWeight: '700',
    fontSize: moderateScale(15),
  },
});
