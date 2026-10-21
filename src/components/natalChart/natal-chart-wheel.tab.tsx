// components/natal-chart/natal-wheel-tab.tsx

import { useWindowDimensions, View } from 'react-native';

import BirthChartWheel from '@/src/components/natalChart/natal-chart-wheel.draw';
import { S } from '@/src/constants/theme';
import type { NatalChart } from '@/src/services/astroEngine';

interface NatalWheelTabProps {
  natalChart: NatalChart;
}

/**
 * The wheel is an SVG drawing — glyphs, degrees and aspect lines — so a screen
 * reader gets nothing from it. This gives it a short spoken summary and points
 * to the table, which carries every placement as text.
 */
export function wheelSummary(natalChart: NatalChart): string {
  const sign = (name: string) => natalChart.planets.find(p => p.name === name)?.sign;
  const parts = [
    sign('Sun') && `Sun in ${sign('Sun')}`,
    sign('Moon') && `Moon in ${sign('Moon')}`,
    natalChart.ascendant?.sign && `Rising in ${natalChart.ascendant.sign}`,
  ].filter(Boolean);
  return `Natal chart wheel. ${parts.join(', ')}. The Natal Table tab lists every placement.`;
}

export default function NatalWheelTab({ natalChart }: NatalWheelTabProps) {
  const { width, height } = useWindowDimensions();
  // Cap by both width and ~28% of screen height so the wheel fits the smaller container
  const wheelSize = Math.min(width - S.xs * 2, height * 0.28);

  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={wheelSummary(natalChart)}
    >
      <BirthChartWheel natalChart={natalChart} size={wheelSize} />
    </View>
  );
}