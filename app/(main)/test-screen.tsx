/**
 * InputScreen.tsx
 * Birth data entry. Two columns for lat/lon. Timezone picker.
 * Transit date picker. Dark cosmic aesthetic.
 */

import { C, R, S } from '@/src/constants/theme';
import { BirthData, calculateNatalChart, calculateTransits } from '@/src/services/astroEngine';
import { TestingStore } from '@/src/stores/testing-store';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Types ────────────────────────────────────────────────────────────────────

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  address: {
    city?: string; town?: string; village?: string; municipality?: string;
    state?: string; country?: string;
  };
};

// Keep only results that have a city/town/village name in their structured address.
// Filters out counties, states, countries, and other non-city results regardless of Nominatim type.
function hasCity(r: NominatimResult): boolean {
  const a = r.address;
  return !!(a.city ?? a.town ?? a.village ?? a.municipality);
}

function formatPlace(r: NominatimResult): string {
  const a = r.address;
  const place = a.city ?? a.town ?? a.village ?? a.municipality;
  return [place, a.state, a.country].filter(Boolean).join(', ') || r.display_name;
}



// ─── Tiny reusable bits ───────────────────────────────────────────────────────

function FieldLabel({ t }: { t: string }) {
  return <Text style={st.fieldLabel}>{t}</Text>;
}

function TextBox({
  value, onChange, placeholder, numeric,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder: string;
  numeric?: boolean;
}) {
  return (
    <TextInput
      style={st.textBox}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={C.dimText}
      keyboardType={numeric ? 'numbers-and-punctuation' : 'default'}
      selectionColor={C.gold}
      autoCorrect={false}
    />
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={st.card}>{children}</View>;
}

// ─── Timezone auto-detect helpers ─────────────────────────────────────────────

/**
 * Given an IANA timezone name and a Date, return the UTC offset in hours
 * (e.g. -5 for CDT, +5.5 for IST) at that exact moment — DST included.
 * Rounds to nearest 15 min to cover offsets like Nepal +5:45, Chatham +12:45.
 */
function getUtcOffsetHours(ianaTimezone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaTimezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => {
    const p = parts.find(x => x.type === type);
    return p ? parseInt(p.value) : 0;
  };
  let h = get('hour');
  if (h === 24) h = 0;  // midnight edge-case
  const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'));
  return Math.round((localMs - date.getTime()) / 900000) * 0.25;
}


// ─── Main ─────────────────────────────────────────────────────────────────────

export default function InputScreen() {
  // Form state
  const [name,        setName]        = useState('');
  const [birthDate,   setBirthDate]   = useState(new Date(1990, 0, 15, 12, 0));
  const [lat,         setLat]         = useState('');
  const [lon,         setLon]         = useState('');
  const [city,        setCity]        = useState('');
  const [tzValue,     setTzValue]     = useState(0);        // UTC offset in hours
  const [tzDisplay,   setTzDisplay]   = useState('');       // e.g. "America/Chicago  ·  UTC−5"
  const [transitDate,   setTransitDate]   = useState(new Date());
  const [transitPicked, setTransitPicked] = useState(false);  // true once user explicitly picks a date

  // Picker visibility
  const [showBirthDate, setShowBirthDate] = useState(false);
  const [showBirthTime, setShowBirthTime] = useState(false);
  const [showTransit,   setShowTransit]   = useState(false);

  const [loading,           setLoading]           = useState(false);
  const [synastryLoading,   setSynastryLoading]   = useState(false);
  const [locationResults,   setLocationResults]   = useState<NominatimResult[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


  // ── Date picker handlers ──────────────────────────────────────────────────

  const onPickBirthDate = (_: DateTimePickerEvent, d?: Date) => {
    setShowBirthDate(false);
    if (!d) return;
    setBirthDate(prev => {
      const next = new Date(d);
      next.setHours(prev.getHours(), prev.getMinutes());
      return next;
    });
  };

  const onPickBirthTime = (_: DateTimePickerEvent, d?: Date) => {
    setShowBirthTime(false);
    if (!d) return;
    setBirthDate(prev => {
      const next = new Date(prev);
      next.setHours(d.getHours(), d.getMinutes());
      return next;
    });
  };

  const onPickTransit = (_: DateTimePickerEvent, d?: Date) => {
    setShowTransit(false);
    if (d) { setTransitDate(d); setTransitPicked(true); }
  };

  // ── Calculate ─────────────────────────────────────────────────────────────

  const handleCalculate = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a name for this chart.');
      return;
    }
    const latNum = parseFloat(lat.replace(',', '.'));
    const lonNum = parseFloat(lon.replace(',', '.'));
    if (isNaN(latNum) || isNaN(lonNum)) {
      Alert.alert('Location required', 'Search and select a birth location above.');
      return;
    }
    if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
      Alert.alert('Invalid coords', 'Lat: −90 to 90  •  Lon: −180 to 180');
      return;
    }

    setLoading(true);
    try {
      const bd: BirthData = {
        year:     birthDate.getFullYear(),
        month:    birthDate.getMonth() + 1,
        day:      birthDate.getDate(),
        hour:     birthDate.getHours(),
        minute:   birthDate.getMinutes(),
        lat:      latNum,
        lon:      lonNum,
        timezone: tzValue,
      };

      // Use current time unless user explicitly picked a date
      const effectiveTransitDate = transitPicked ? transitDate : new Date();

      const [natalChart, transits] = await Promise.all([
        calculateNatalChart(bd),
        calculateTransits(effectiveTransitDate, latNum, lonNum),
      ]);

      console.log('Natal chart and transits calculated successfully:', { natalChart, transits });

      const { date: transitDateObj, ...transitsData } = transits;
      TestingStore.setResults({ natalChart, transits: transitsData, transitDate: transitDateObj.toISOString(), name: name.trim(), birthData: bd });
      router.push('/(testing)/ResultsScreen');
    } catch (e: any) {
      Alert.alert('Calculation Error', e?.message ?? 'Unknown error. Check inputs and try again.');
    } finally {
      setLoading(false);
    }
  }, [name, birthDate, lat, lon, tzValue, transitDate, transitPicked]);

  // ── Go straight to synastry (Person A) ───────────────────────────────────

  const handleSynastry = useCallback(async () => {
    if (!name.trim()) { Alert.alert('Name required', 'Enter a name for this chart.'); return; }
    const latNum = parseFloat(lat.replace(',', '.'));
    const lonNum = parseFloat(lon.replace(',', '.'));
    if (isNaN(latNum) || isNaN(lonNum)) { Alert.alert('Location required', 'Search and select a birth location above.'); return; }

    setSynastryLoading(true);
    try {
      const bd: BirthData = {
        year: birthDate.getFullYear(), month: birthDate.getMonth() + 1,
        day: birthDate.getDate(), hour: birthDate.getHours(),
        minute: birthDate.getMinutes(), lat: latNum, lon: lonNum, timezone: tzValue,
      };
      const natalChart = await calculateNatalChart(bd);
      TestingStore.setSynastry({ chartA: natalChart, nameA: name.trim() });
      router.push('/connection/SynastryScreen');
    } catch (e: any) {
      Alert.alert('Calculation Error', e?.message ?? 'Unknown error.');
    } finally {
      setSynastryLoading(false);
    }
  }, [name, birthDate, lat, lon, tzValue]);

  // ── Location search ───────────────────────────────────────────────────────

  const searchLocation = useCallback(async (query: string) => {
    setLocationSearching(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10&addressdetails=1`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'AstroNatal/1.0' } }
      );
      if (!resp.ok) throw new Error();
      const all = await resp.json() as NominatimResult[];
      const seen = new Set<string>();
      setLocationResults(
        all.filter(r => {
          if (!hasCity(r)) return false;
          const label = formatPlace(r);
          if (seen.has(label)) return false;
          seen.add(label);
          return true;
        })
      );
    } catch {
      setLocationResults([]);
    } finally {
      setLocationSearching(false);
    }
  }, []);

  const onCityChange = useCallback((text: string) => {
    setCity(text);
    setLat('');
    setLon('');
    setTzValue(0);
    setTzDisplay('');
    setLocationResults([]);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length >= 2) {
      searchTimer.current = setTimeout(() => searchLocation(text), 600);
    }
  }, [searchLocation]);

  // ── Timezone detection ────────────────────────────────────────────────────
  // Called automatically when a location is selected.

  const detectTimezone = useCallback(async (latNum: number, lonNum: number): Promise<void> => {
    try {
      // Open-Meteo returns the IANA timezone name for any coordinate.
      // Free, no API key, extremely reliable. The `timezone` field at root
      // level is always present when timezone=auto is passed.
      const resp = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latNum}&longitude=${lonNum}&timezone=auto&current=temperature_2m`
      );
      if (!resp.ok) return;
      const data = await resp.json() as { timezone?: string; utc_offset_seconds?: number };
      const tzName = data.timezone;
      if (!tzName) return;

      // Use noon UTC on the birth date so historical DST rules apply correctly.
      const refDate = new Date(Date.UTC(
        birthDate.getFullYear(),
        birthDate.getMonth(),
        birthDate.getDate(),
        12, 0, 0
      ));

      let offset: number;
      try {
        offset = getUtcOffsetHours(tzName, refDate);
      } catch {
        // Intl fallback: use Open-Meteo's current UTC offset (may be off by
        // 1 hr at DST transitions vs. the historical birth-date offset).
        offset = Math.round(((data.utc_offset_seconds ?? 0) / 3600) * 4) / 4;
      }

      setTzValue(offset);
      const sign = offset >= 0 ? '+' : '−';
      const absH = Math.floor(Math.abs(offset));
      const absM = Math.round((Math.abs(offset) % 1) * 60);
      const offsetStr = absM ? `UTC${sign}${absH}:${String(absM).padStart(2, '0')}` : `UTC${sign}${absH}`;
      setTzDisplay(`${tzName}  ·  ${offsetStr}`);
    } catch {
      // silent fail — tzValue stays at 0 (UTC)
    }
  }, [birthDate]);

  const selectLocation = useCallback((r: NominatimResult) => {
    setCity(formatPlace(r));
    setLat(r.lat);
    setLon(r.lon);
    setLocationResults([]);
  }, []);

  // Re-detect timezone whenever birth date or coordinates change.
  // This ensures DST is correct regardless of which the user sets first.
  useEffect(() => {
    if (!lat || !lon) return;
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (isNaN(latNum) || isNaN(lonNum)) return;
    detectTimezone(latNum, lonNum);
  }, [birthDate, lat, lon, detectTimezone]);

  // ── Format helpers ─────────────────────────────────────────────────────────

  const fDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const fTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    
    <SafeAreaView style={st.safe} edges={['top']}>
      <ImageBackground source={require('@/src/assets/themes-png/default-theme.png')} style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor={C.cosmos} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={st.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* Header ──────────────────────────────────────────────────────── */}
          <View style={st.header}>
            <Text style={st.starDeco}>· ✦ · ✦ · ✦ ·</Text>
            <Text style={st.appTitle}>Natal Chart</Text>
            <Text style={st.appSub}>SWISS EPHEMERIS  ·  PRECISION CHARTS</Text>
          </View>

          {/* Name ────────────────────────────────────────────────────────── */}
          <Card>
            <FieldLabel t="NAME" />
            <TextBox value={name} onChange={setName} placeholder="Chart subject name…" />
          </Card>

          {/* Birth date & time ───────────────────────────────────────────── */}
          <Card>
            <FieldLabel t="BIRTH DATE & TIME" />
            <View style={st.row}>
              <TouchableOpacity style={[st.pillBtn, { flex: 3 }]} onPress={() => setShowBirthDate(true)}>
                <Text style={st.pillIcon}>📅</Text>
                <Text style={st.pillText}>{fDate(birthDate)}</Text>
              </TouchableOpacity>
              <View style={{ width: S.sm }} />
              <TouchableOpacity style={[st.pillBtn, { flex: 2 }]} onPress={() => setShowBirthTime(true)}>
                <Text style={st.pillIcon}>🕐</Text>
                <Text style={st.pillText}>{fTime(birthDate)}</Text>
              </TouchableOpacity>
            </View>
            {showBirthDate && (
              <DateTimePicker
                value={birthDate} mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant="dark" maximumDate={new Date()}
                onChange={onPickBirthDate}
              />
            )}
            {showBirthTime && (
              <DateTimePicker
                value={birthDate} mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant="dark"
                onChange={onPickBirthTime}
              />
            )}
          </Card>

          {/* Location ────────────────────────────────────────────────────── */}
          <Card>
            <FieldLabel t="BIRTH LOCATION" />
            <View style={st.locationSearchRow}>
              <TextInput
                style={[st.textBox, st.locationInput]}
                value={city}
                onChangeText={onCityChange}
                placeholder="Search city or place…"
                placeholderTextColor={C.dimText}
                selectionColor={C.gold}
                autoCorrect={false}
              />
              {locationSearching && (
                <ActivityIndicator style={st.locationSpinner} size="small" color={C.nebulaTeal} />
              )}
            </View>
            {locationResults.length > 0 && (
              <ScrollView style={st.locationDrop} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {locationResults.map(r => (
                  <TouchableOpacity key={r.place_id} style={st.locationRow} onPress={() => selectLocation(r)}>
                    <Text style={st.locationRowText} numberOfLines={1}>{formatPlace(r)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {lat !== '' && lon !== '' && (
              <Text style={st.locationCoords}>
                📍  {parseFloat(lat).toFixed(4)}°  {parseFloat(lon).toFixed(4)}°
              </Text>
            )}
            {tzDisplay !== '' && (
              <Text style={st.locationTz}>{tzDisplay}</Text>
            )}
          </Card>


          {/* Transit date ────────────────────────────────────────────────── */}
          <Card>
            <FieldLabel t="TRANSIT DATE  (TODAY'S SKY)" />
            <TouchableOpacity style={st.pillBtn} onPress={() => setShowTransit(true)}>
              <Text style={st.pillIcon}>🔭</Text>
              <Text style={st.pillText}>{fDate(transitDate)}</Text>
            </TouchableOpacity>
            {showTransit && (
              <DateTimePicker
                value={transitDate} mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant="dark"
                onChange={onPickTransit}
              />
            )}
          </Card>

          {/* Calculate button ─────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[st.calcBtn, (loading || synastryLoading) && st.calcBtnDisabled]}
            onPress={handleCalculate}
            disabled={loading || synastryLoading}
            activeOpacity={0.75}
          >
            {loading
              ? <ActivityIndicator color={C.void} />
              : <Text style={st.calcBtnText}>✦  CALCULATE CHART  ✦</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={[st.synastryBtn, (loading || synastryLoading) && st.calcBtnDisabled]}
            onPress={handleSynastry}
            disabled={loading || synastryLoading}
            activeOpacity={0.75}
          >
            {synastryLoading
              ? <ActivityIndicator color={C.goldBright} />
              : <Text style={st.synastryBtnText}>♡  SYNASTRY</Text>
            }
          </TouchableOpacity>

          <Text style={st.footer}>
            Powered by react-native-swisseph · Moshier Ephemeris
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
      </ImageBackground>
    </SafeAreaView>
    
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.cosmos },
  scroll: { paddingHorizontal: S.md, paddingBottom: S.xxl },

  header: { alignItems: 'center', paddingTop: S.xl, paddingBottom: S.lg },
  starDeco: { color: C.goldDim, fontSize: 11, letterSpacing: 8, marginBottom: S.sm },
  appTitle: {
    fontSize: 34, fontWeight: '800', letterSpacing: 8,
    color: C.goldBright, fontFamily: 'serif',
  },
  appSub: {
    fontSize: 10, letterSpacing: 3, color: C.nebulaTeal,
    marginTop: 6, textTransform: 'uppercase',
  },

  card: {
    backgroundColor: C.nebula,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.starfield,
    padding: S.md,
    marginBottom: S.md,
  },
  fieldLabel: {
    color: C.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.5,
    marginBottom: S.sm,
  },
  textBox: {
    backgroundColor: C.deepSpace,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.starfield,
    color: C.white,
    fontSize: 15,
    paddingHorizontal: S.md,
    paddingVertical: S.sm + 2,
    marginBottom: S.sm,
  },
  row: { flexDirection: 'row' },
  hint: { color: C.dimText, fontSize: 11, fontStyle: 'italic', marginTop: 2 },

  locationSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: S.sm,
  },
  locationInput: {
    flex: 1,
    marginBottom: 0,
  },
  locationSpinner: {
    marginLeft: S.sm,
  },
  locationDrop: {
    maxHeight: 200,
    backgroundColor: C.deepSpace,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.starfield,
    marginBottom: S.sm,
  },
  locationRow: {
    paddingHorizontal: S.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.starfield,
  },
  locationRowText: {
    color: C.white,
    fontSize: 13,
    lineHeight: 18,
  },
  locationCoords: {
    color: C.nebulaTeal,
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 2,
  },
  locationTz: {
    color: C.muted,
    fontSize: 10,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 4,
  },

  pillBtn: {
    backgroundColor: C.deepSpace,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.starfield,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingVertical: S.sm + 2,
    marginBottom: S.sm,
  },
  pillIcon: { fontSize: 15, marginRight: S.sm },
  pillText: { color: C.white, fontSize: 14 },

  tzButton: {
    backgroundColor: C.deepSpace,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.starfield,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingVertical: S.sm + 2,
  },
  tzButtonText: { color: C.white, fontSize: 14 },
  tzChevron: { color: C.gold, fontSize: 11 },
  tzDrop: {
    maxHeight: 200,
    backgroundColor: C.deepSpace,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.starfield,
    marginTop: S.sm,
  },
  tzRow: {
    paddingHorizontal: S.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.starfield,
  },
  tzRowActive: { backgroundColor: C.purpleDim },
  tzRowText: { color: C.muted, fontSize: 13 },
  tzRowTextActive: { color: C.goldBright, fontWeight: '700' },

  tzDetectBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.deepSpace,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.nebulaTeal,
    height: 38,
    marginBottom: S.sm,
  },
  tzDetectText: {
    color: C.nebulaTeal,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  tzDetectHint: {
    color: C.muted,
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: S.sm,
    textAlign: 'center',
  },

  calcBtn: {
    backgroundColor: C.gold,
    borderRadius: R.pill,
    paddingVertical: S.md + 4,
    alignItems: 'center',
    marginTop: S.sm,
    shadowColor: C.gold,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  calcBtnDisabled: { opacity: 0.55 },
  calcBtnText: {
    color: C.void,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 3,
  },

  synastryBtn: {
    backgroundColor: 'transparent', borderRadius: R.pill, paddingVertical: S.md + 4,
    alignItems: 'center', marginTop: S.sm, borderWidth: 1, borderColor: C.goldBright,
  },
  synastryBtnText: { color: C.goldBright, fontSize: 15, fontWeight: '600', letterSpacing: 3 },

  footer: {
    color: C.dimText,
    fontSize: 10,
    textAlign: 'center',
    marginTop: S.lg,
    letterSpacing: 1,
  },
});
