// components/natal-chart/natal-wheel-tab.tsx

import { useWindowDimensions, View } from 'react-native';

import BirthChartWheel from '@/src/components/natalChart/BirthChartWheel';
import { S } from '@/src/constants/theme';
import type { NatalChart } from '@/src/services/astroEngine';

interface NatalWheelTabProps {
  natalChart: NatalChart;
}

export default function NatalWheelTab({ natalChart }: NatalWheelTabProps) {
  const { width, height } = useWindowDimensions();
  // Cap by both width and ~28% of screen height so the wheel fits the smaller container
  const wheelSize = Math.min(width - S.xl * 2, height * 0.33);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <BirthChartWheel natalChart={natalChart} size={wheelSize} />
    </View>
  );
}