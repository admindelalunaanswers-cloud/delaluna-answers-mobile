import Svg, { Circle, Polyline } from 'react-native-svg';

import { C } from '@/src/constants/theme';

// A fixed zig-zag so it reads as a constellation rather than a progress bar.
const HEIGHTS = [16, 10, 18, 8, 15, 11, 19];
const STEP_X = 30;
const PAD_X = 8;
const VIEW_H = 28;

interface Props {
  total: number;
  /** Index of the star being shown. Ignored when `complete`. */
  current: number;
  /** Every star lit — the finish card. */
  complete?: boolean;
  width?: number;
}

/**
 * Decorative: the step card's title already says "Step n of m" to a screen
 * reader, so the drawing is hidden from it.
 */
export default function ConstellationProgress({ total, current, complete = false, width }: Props) {
  const points = Array.from({ length: total }, (_, i) => ({
    x: PAD_X + i * STEP_X,
    y: HEIGHTS[i % HEIGHTS.length],
  }));
  const viewW = PAD_X * 2 + (total - 1) * STEP_X;
  const litUpTo = complete ? total - 1 : current;
  const toStr = (ps: typeof points) => ps.map((p) => `${p.x},${p.y}`).join(' ');
  const w = width ?? viewW;

  return (
    <Svg
      width={w}
      height={(w / viewW) * VIEW_H}
      viewBox={`0 0 ${viewW} ${VIEW_H}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {litUpTo > 0 ? (
        <Polyline points={toStr(points.slice(0, litUpTo + 1))} stroke={C.gold} strokeWidth={1.5} fill="none" />
      ) : null}
      {litUpTo < total - 1 ? (
        <Polyline
          points={toStr(points.slice(litUpTo))}
          stroke={C.nebulaTeal}
          strokeOpacity={0.5}
          strokeWidth={1}
          fill="none"
        />
      ) : null}
      {points.map((p, i) => {
        if (!complete && i === current) {
          return [
            <Circle key={`ring${i}`} cx={p.x} cy={p.y} r={9} stroke={C.turquoise} strokeOpacity={0.4} fill="none" />,
            <Circle key={`star${i}`} cx={p.x} cy={p.y} r={5} fill={C.turquoise} />,
          ];
        }
        if (i < current || complete) {
          return <Circle key={`star${i}`} cx={p.x} cy={p.y} r={4} fill={C.gold} />;
        }
        return <Circle key={`star${i}`} cx={p.x} cy={p.y} r={3.5} stroke={C.nebulaTeal} fill="none" />;
      })}
    </Svg>
  );
}
