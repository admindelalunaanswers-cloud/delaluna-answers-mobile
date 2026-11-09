import { act, renderHook } from '@testing-library/react-native';

import { sectionsInView, useSectionsReached } from '@/src/hooks/use-sections-reached';

const layout = (y: number, height: number) => ({ nativeEvent: { layout: { x: 0, y, width: 300, height } } }) as any;
const scroll = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y } } }) as any;

describe('sectionsInView', () => {
  const layouts = { top: { y: 0, height: 300 }, middle: { y: 600, height: 300 }, bottom: { y: 1200, height: 40 } };

  it('counts a section once enough of it is on screen', () => {
    expect(sectionsInView(layouts, 0, 650)).toEqual(['top']); // 50pt of middle: not yet
    expect(sectionsInView(layouts, 0, 700)).toEqual(['top', 'middle']);
  });

  it('counts a short section only when all of it is visible', () => {
    expect(sectionsInView(layouts, 600, 620)).toEqual(['middle']); // 20 of 40
    expect(sectionsInView(layouts, 600, 640)).toEqual(['middle', 'bottom']);
  });

  it('sees nothing before the viewport is measured', () => {
    expect(sectionsInView(layouts, 0, 0)).toEqual([]);
  });
});

describe('useSectionsReached', () => {
  it('reports each section once, as it scrolls into view', () => {
    const onReach = jest.fn();
    const { result } = renderHook(() => useSectionsReached(onReach));

    act(() => {
      result.current.onViewportLayout(layout(0, 500));
      result.current.onLayout('a')(layout(0, 300));
      result.current.onLayout('b')(layout(900, 300));
    });
    expect(onReach.mock.calls).toEqual([['a']]);

    act(() => {
      result.current.onScroll(scroll(600));
      result.current.onScroll(scroll(0));
      result.current.onScroll(scroll(600));
    });
    expect(onReach.mock.calls).toEqual([['a'], ['b']]);
  });

  // A section seen as a loading skeleton hasn't been read.
  it('waits until enabled, then counts what is already on screen', () => {
    const onReach = jest.fn();
    const { result, rerender } = renderHook(({ enabled }: { enabled: boolean }) => useSectionsReached(onReach, enabled), {
      initialProps: { enabled: false },
    });

    act(() => {
      result.current.onViewportLayout(layout(0, 500));
      result.current.onLayout('a')(layout(0, 300));
    });
    expect(onReach).not.toHaveBeenCalled();

    rerender({ enabled: true });
    expect(onReach.mock.calls).toEqual([['a']]);
  });
});
