// components/natal-chart/natal-wheel-tab.tsx

import BirthChartWheel from '@/src/components/natalChart/BirthChartWheel';
import { S } from '@/src/constants/theme';
import type { NatalChart } from '@/src/services/astroEngine';
import { useWindowDimensions, View } from 'react-native';

interface NatalWheelTabProps {
  natalChart: NatalChart;
}

export default function NatalWheelTab({ natalChart }: NatalWheelTabProps) {
  const { width } = useWindowDimensions();
  const wheelSize = width - S.xl * 2;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: S.lg }}>
      <BirthChartWheel natalChart={natalChart} size={wheelSize} />
    </View>
  );
}