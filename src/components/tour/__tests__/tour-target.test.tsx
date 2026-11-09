import { createTourTargetRegistry } from '@/src/components/tour/tour-target';

const entry = () => ({ ref: { current: null }, activate: jest.fn() });

describe('createTourTargetRegistry', () => {
  it('finds what was registered', () => {
    const registry = createTourTargetRegistry();
    const a = entry();
    registry.register('home-signs', a);
    expect(registry.get('home-signs')).toBe(a);
    expect(registry.get('nope')).toBeUndefined();
  });

  // react-navigation mounts each tab icon twice (active and inactive). Losing
  // one of the pair must not lose the target.
  it('keeps the other mount when one of two with the same id unmounts', () => {
    const registry = createTourTargetRegistry();
    const first = entry();
    const second = entry();
    registry.register('tab-transits', first);
    const unregisterSecond = registry.register('tab-transits', second);
    expect(registry.get('tab-transits')).toBe(second);

    unregisterSecond();
    expect(registry.get('tab-transits')).toBe(first);
  });

  it('forgets an id once its last mount is gone', () => {
    const registry = createTourTargetRegistry();
    const unregister = registry.register('chat-mode-toggle', entry());
    unregister();
    expect(registry.get('chat-mode-toggle')).toBeUndefined();
  });
});
