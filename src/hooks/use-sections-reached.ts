/**
 * Read-depth for a long scroll: reports each named section the first time it
 * scrolls into view, so analytics can say how far down people actually read.
 *
 * Attach `onLayout(key)` to each section (a direct child of the ScrollView's
 * content, so its `y` is relative to the content), and `onScroll` /
 * `onViewportLayout` to the ScrollView. Sections already on screen when the
 * layout lands count without any scrolling.
 *
 * Nothing is reported while `enabled` is false, so a section passed over while
 * it was still a loading skeleton is counted later, when it holds content.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export interface SectionLayout {
  y: number;
  height: number;
}

/**
 * Keys of the sections in view at this scroll position. A section counts once
 * `minVisible` points of it (or all of it, if shorter) are inside the viewport.
 */
export function sectionsInView(
  layouts: Record<string, SectionLayout>,
  scrollY: number,
  viewportHeight: number,
  minVisible = 80,
): string[] {
  if (viewportHeight <= 0) return [];
  const bottom = scrollY + viewportHeight;
  return Object.entries(layouts)
    .filter(([, { y, height }]) => {
      const visible = Math.min(bottom, y + height) - Math.max(scrollY, y);
      return visible >= Math.min(minVisible, height);
    })
    .map(([key]) => key);
}

export function useSectionsReached(onReach: (key: string) => void, enabled = true) {
  const layouts = useRef<Record<string, SectionLayout>>({});
  const reached = useRef(new Set<string>());
  const scrollY = useRef(0);
  const viewport = useRef(0);
  // Latest callback and flag, for the stable handlers below. Synced in an
  // effect, not during render. The layout and scroll events these handlers
  // answer only arrive after a commit, so they never see a stale value.
  const onReachRef = useRef(onReach);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    onReachRef.current = onReach;
    enabledRef.current = enabled;
  });

  const check = useCallback(() => {
    if (!enabledRef.current) return;
    for (const key of sectionsInView(layouts.current, scrollY.current, viewport.current)) {
      if (reached.current.has(key)) continue;
      reached.current.add(key);
      onReachRef.current(key);
    }
  }, []);

  // Turning on (the content arrived) counts whatever is already on screen.
  useEffect(() => {
    if (enabled) check();
  }, [enabled, check]);

  const onLayout = useCallback(
    (key: string) => (e: LayoutChangeEvent) => {
      const { y, height } = e.nativeEvent.layout;
      layouts.current[key] = { y, height };
      check();
    },
    [check],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = e.nativeEvent.contentOffset.y;
      check();
    },
    [check],
  );

  const onViewportLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewport.current = e.nativeEvent.layout.height;
      check();
    },
    [check],
  );

  return { onLayout, onScroll, onViewportLayout };
}
