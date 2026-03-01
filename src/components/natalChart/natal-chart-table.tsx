// components/natal-chart/natal-table.tsx

import { C, S } from '@/src/constants/theme';
import type { PlanetPosition } from '@/src/services/astroEngine';
import { StyleSheet, Text, View } from 'react-native';

interface NatalTableProps {
  planets: PlanetPosition[];
  asc: { sign: string; signSymbol: string; degree: number; minutes: number };
}

type Row = {
  sign: string; symbol: string; name: string;
  house: number; retrograde: boolean; color: string;
};

export default function NatalTable({ planets, asc }: NatalTableProps) {
  const rows: Row[] = [
    { sign: asc.sign, symbol: '↑', name: 'ASCENDANT', house: 1, retrograde: false, color: C.goldBright },
    ...planets.map(p => ({
      sign: p.sign, symbol: p.symbol, name: p.name.toUpperCase(),
      house: p.house, retrograde: p.isRetrograde, color: C.planet[p.name] ?? C.muted,
    })),
  ].sort((a, b) => a.house - b.house);

  // Group consecutive rows by house number
  const groups: Row[][] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last[0].house === row.house) {
      last.push(row);
    } else {
      groups.push([row]);
    }
  }

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

      {/* House groups */}
      {groups.map((group, gi) => (
        <View key={gi} style={[et.group, et.groupBorder]}>
          {/* Stacked sign + planet rows */}
          <View style={et.leftCols}>
            {group.map((row, ri) => {
              const showSign = ri === 0 || group[ri - 1].sign !== row.sign;
              return (
                <View
                  key={ri}
                  style={[et.innerRow, ri < group.length - 1 && et.innerRowDivider]}
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
            })}
          </View>

          {/* Single merged house cell spanning all rows in group */}
          <View style={et.houseCol}>
            <Text style={et.houseNum}>{group[0].house}</Text>
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
    paddingVertical: 6,
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
    gap: 6,
  },
  houseCol: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: C.starfield,
  },
  headerHouseCol: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.starfield,
  },

  hdr: {
    color: C.white,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.5,
    textAlign: 'center',
  },
  signName: {
    color: C.white,
    fontSize: 15,
    fontWeight: '400',
    fontFamily: 'serif',
    letterSpacing: 0.2,
  },
  pSym: { fontSize: 15 },
  pName: {
    color: C.white,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  houseNum: {
    color: C.goldBright,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
});
