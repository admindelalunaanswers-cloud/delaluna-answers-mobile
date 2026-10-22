// components/natal-chart/natal-table.tab.tsx

import { StyleSheet, View } from 'react-native';
import { Text } from '@/src/components/app-text';

import { C, S } from '@/src/constants/theme';
import type { SerializedPlanet } from '@/src/types/user.type';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';
import { ThemedView } from '../themed-view';
import { ThemedText } from '../themed-text';

interface NatalTableProps {
  planets: SerializedPlanet[];
  asc: { sign: string; signSymbol: string; degree: number; minutes: number };
}

type Entry = { name: string; symbol: string; sign: string; retrograde: boolean };

/** "Mercury in Aries, house 1, retrograde" — retrograde isn't drawn, so this is the only place it shows. */
export function placementLabel(entry: Entry, house: number): string {
  return `${entry.name} in ${entry.sign}, house ${house}${entry.retrograde ? ', retrograde' : ''}`;
}

export default function NatalTable({ planets, asc }: NatalTableProps) {
  // Build house groups 1–12 (all 12 always rendered)
  const byHouse = new Map<number, Entry[]>();
  for (let h = 1; h <= 12; h++) byHouse.set(h, []);

  // ASC first in house 1
  byHouse.get(1)!.push({ name: 'Ascendant', symbol: '↑', sign: asc.sign, retrograde: false, });

  for (const p of planets) {
    byHouse.get(p.house)?.push({ name: p.name, symbol: p.symbol, sign: p.sign, retrograde: p.isRetrograde, });
  }

  return (
    <ThemedView style={et.wrap}>
      {/* Header — hidden from screen readers: every row below reads in full, so
          the column names would only be read as content */}
      <ThemedView
        style={et.group}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <ThemedView style={et.leftCols}>
          <ThemedView style={et.innerRow}>
            <ThemedView style={et.signCol}><ThemedText type="table" style={et.hdr}>SIGN</ThemedText></ThemedView>
            <ThemedView style={et.planetCol}><ThemedText type="table" style={et.hdr}>PLANET</ThemedText></ThemedView>
          </ThemedView>
        </ThemedView>
        <ThemedView style={[et.houseCol, et.headerHouseCol]}>
          <ThemedText type="table" style={et.hdr}>HOUSE</ThemedText>
        </ThemedView>
      </ThemedView>

      {Array.from({ length: 12 }, (_, i) => i + 1)
        .filter(h => (byHouse.get(h)?.length ?? 0) > 0)
        .map(h => {
        const entries = byHouse.get(h)!;

        return (
          <ThemedView key={h} style={[et.group, et.groupBorder]}>
            <ThemedView style={et.leftCols}>
              {entries.map((entry, ri) => {
                  const showSign = ri === 0 || entries[ri - 1].sign !== entry.sign;
                  return (
                    // One stop per placement. Cell by cell it read "Aries, ☉, SUN, 1" —
                    // the sign only on a group's first row and the house last,
                    // after every planet in it.
                    <ThemedView
                      key={ri}
                      style={[et.innerRow, ri < entries.length - 1 && et.innerRowDivider]}
                      accessible
                      accessibilityLabel={placementLabel(entry, h)}
                    >
                      <ThemedView style={et.signCol}>
                        {showSign && <ThemedText type="table" style={et.signName}>{entry.sign}</ThemedText>}
                      </ThemedView>
                      <ThemedView style={et.planetCol}>
                        <ThemedText type="table" style={et.pSym}>{entry.symbol}</ThemedText>
                        <ThemedText type="table" style={et.pName}>
                          {entry.name}
                        </ThemedText>
                      </ThemedView>
                    </ThemedView>
                  );
                })
            }
            </ThemedView>

            {/* House number — merged cell spanning all rows in this group.
                Already in each row's label, so hidden from screen readers. */}
            <ThemedView
              style={et.houseCol}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <ThemedText type="table" style={et.houseNum}>{h}</ThemedText>
            </ThemedView>
          </ThemedView>
        );
      })}
    </ThemedView>
  );
}

const et = StyleSheet.create({
  wrap: { overflow: 'hidden' },

  group:       { flexDirection: 'row' },
  groupBorder: { borderTopWidth: 1, borderTopColor: C.starfield },

  leftCols: { flex: 2 },

  innerRow: {
    flexDirection: 'row',
    paddingVertical: verticalScale(2),
  },
  innerRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: `${C.starfield}55`,
  },

  signCol: {
    flex: 1,
    paddingHorizontal: S.xs,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: C.starfield,
  },
  planetCol: {
    flex: 1,
    paddingHorizontal: S.xs,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: scale(6),
  },
  houseCol: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: C.starfield,
  },
  headerHouseCol: {
    paddingVertical: verticalScale(2),
    borderBottomWidth: 1,
    borderBottomColor: C.starfield,
  },

  hdr: {
    color: C.white,
    fontSize: moderateScale(10),
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
  },
  signName: {
    color: C.white,
    fontSize: moderateScale(12),
    fontWeight: '400',
    fontFamily: 'serif',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  pSym: { fontSize: moderateScale(12), color: C.white },
  pName: {
    fontSize: moderateScale(10),
    fontWeight: '800',
    letterSpacing: 1,
    color: C.white,
  },
  houseNum: {
    color: C.white,
    fontSize: moderateScale(14),
    fontWeight: '700',
  },

});
