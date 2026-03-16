// components/natal-chart/natal-table.tab.tsx

import { StyleSheet, Text, View } from 'react-native';

import { C, S } from '@/src/constants/theme';
import type { PlanetPosition } from '@/src/services/astroEngine';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';

const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

function signFromLon(lon: number): string {
  return ZODIAC_SIGNS[Math.floor(((lon % 360) + 360) % 360 / 30)];
}

interface NatalTableProps {
  planets: PlanetPosition[];
  asc: { sign: string; signSymbol: string; degree: number; minutes: number };
  houses: { cusps: number[] };
}

type Row = {
  sign: string; symbol: string; name: string;
  house: number; retrograde: boolean; color: string;
};

type HouseGroup = {
  house: number;
  cuspSign: string;
  rows: Row[];
};

export default function NatalTable({ planets, asc, houses }: NatalTableProps) {
  // Map house number → planets in that house
  const planetsByHouse = new Map<number, Row[]>();
  for (const p of planets) {
    const row: Row = {
      sign: p.sign, symbol: p.symbol, name: p.name.toUpperCase(),
      house: p.house, retrograde: p.isRetrograde, color: C.planet[p.name] ?? C.muted,
    };
    const existing = planetsByHouse.get(p.house) ?? [];
    existing.push(row);
    planetsByHouse.set(p.house, existing);
  }

  // Prepend ASC row to house 1
  const ascRow: Row = {
    sign: asc.sign, symbol: '↑', name: 'ASCENDANT',
    house: 1, retrograde: false, color: C.goldBright,
  };
  planetsByHouse.set(1, [ascRow, ...(planetsByHouse.get(1) ?? [])]);

  // Build all 12 house groups — empty houses are included with just the cusp sign
  const groups: HouseGroup[] = Array.from({ length: 12 }, (_, i) => {
    const h = i + 1;
    return {
      house: h,
      cuspSign: signFromLon(houses.cusps[h] ?? 0),
      rows: planetsByHouse.get(h) ?? [],
    };
  });

  return (
    <View style={et.wrap}>
      {/* Header — mirrors group layout so columns align */}
      <View style={et.group}>
        <View style={et.leftCols}>
          <View style={et.innerRow}>
            <View style={et.signCol}><Text style={et.hdr}>SIGNS</Text></View>
            <View style={et.planetCol}><Text style={et.hdr}>PLANETS</Text></View>
          </View>
        </View>
        <View style={[et.houseCol, et.headerHouseCol]}>
          <Text style={et.hdr}>HOUSES</Text>
        </View>
      </View>

      {/* House groups — all 12 rendered */}
      {groups.map(({ house, cuspSign, rows }) => (
        <View key={house} style={[et.group, et.groupBorder]}>
          <View style={et.leftCols}>
            {rows.length === 0 ? (
              // Empty house — show cusp sign and a dash
              <View style={et.innerRow}>
                <View style={et.signCol}>
                  <Text style={et.signName}>{cuspSign}</Text>
                </View>
                <View style={et.planetCol}>
                  <Text style={et.emptyText}>—</Text>
                </View>
              </View>
            ) : (
              rows.map((row, ri) => {
                const showSign = ri === 0 || rows[ri - 1].sign !== row.sign;
                return (
                  <View
                    key={ri}
                    style={[et.innerRow, ri < rows.length - 1 && et.innerRowDivider]}
                  >
                    <View style={et.signCol}>
                      {showSign && <Text style={et.signName}>{row.sign}</Text>}
                    </View>
                    <View style={et.planetCol}>
                      <Text style={[et.pSym, { color: row.color }]}>{row.symbol}</Text>
                      <Text style={[et.pName, row.retrograde && { color: C.retro }]}>
                        {row.name}{row.retrograde ? '  ℞' : ''}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Single merged house cell spanning all rows in group */}
          <View style={et.houseCol}>
            <Text style={et.houseNum}>{house}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const et = StyleSheet.create({
  wrap: { overflow: 'hidden' },

  // Outer row for each house group (and header)
  group: {
    flexDirection: 'row',
  },
  groupBorder: {
    borderTopWidth: 1,
    borderTopColor: C.starfield,
  },

  // Left side holds sign + planet columns
  leftCols: {
    flex: 2,
  },

  // One planet row inside leftCols
  innerRow: {
    flexDirection: 'row',
    paddingVertical: verticalScale(6),
  },
  innerRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: `${C.starfield}55`,
  },

  // Columns — each flex:1 inside its container
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
    paddingVertical: S.xs,
    borderBottomWidth: 1,
    borderBottomColor: C.starfield,
  },

  hdr: {
    color: C.white,
    fontSize: moderateScale(12),
    fontWeight: '800',
    letterSpacing: 2.5,
    textAlign: 'center',
  },
  signName: {
    color: C.white,
    fontSize: moderateScale(15),
    fontWeight: '400',
    fontFamily: 'serif',
    letterSpacing: 0.2,
  },
  emptyText: {
    color: C.muted,
    fontSize: moderateScale(14),
  },
  pSym: { fontSize: moderateScale(15) },
  pName: {
    color: C.white,
    fontSize: moderateScale(12),
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  houseNum: {
    color: C.goldBright,
    fontSize: moderateScale(18),
    fontWeight: '700',
    lineHeight: moderateScale(20),
  },
});
