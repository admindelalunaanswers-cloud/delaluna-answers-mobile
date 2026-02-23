import Animated from 'react-native-reanimated';
import { useResponsive } from '@/src/hooks/use-responsive';

export function HelloWave() {
  const { moderateScale, scale } = useResponsive();

  return (
    <Animated.Text
      style={{
        fontSize: moderateScale(28),
        lineHeight: moderateScale(32),
        marginTop: -scale(6),
        animationName: {
          '50%': { transform: [{ rotate: '25deg' }] },
        },
        animationIterationCount: 4,
        animationDuration: '300ms',
      }}>
      👋
    </Animated.Text>
  );
}
