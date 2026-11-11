import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react';
import { View, type ViewProps } from 'react-native';

/**
 * The registry the tour overlay looks targets up in. Deliberately its own tiny
 * module with no imports beyond React: Home, the header and the tab bar
 * register targets, and their tests shouldn't have to mock Firebase or storage
 * to render. Without a provider, registering is a no-op.
 */

export interface TourTargetEntry {
  ref: { current: View | null };
  /** Called before measuring: scroll it into view, select the right day… */
  activate: () => void;
}

export interface TourTargetRegistry {
  register(id: string, entry: TourTargetEntry): () => void;
  get(id: string): TourTargetEntry | undefined;
}

/**
 * Several mounts can share an id — react-navigation draws each tab icon twice
 * (active and inactive, cross-faded), both in the same place. The latest mount
 * wins, and unmounting one leaves the other.
 */
export function createTourTargetRegistry(): TourTargetRegistry {
  const entries = new Map<string, TourTargetEntry[]>();
  return {
    register(id, entry) {
      entries.set(id, [...(entries.get(id) ?? []), entry]);
      return () => {
        const rest = (entries.get(id) ?? []).filter((e) => e !== entry);
        if (rest.length) entries.set(id, rest);
        else entries.delete(id);
      };
    },
    get(id) {
      const list = entries.get(id);
      return list?.[list.length - 1];
    },
  };
}

export const TourTargetContext = createContext<TourTargetRegistry | null>(null);

/**
 * Registers an existing View as a tour target without changing its layout:
 * spread the result onto it (`<View {...tourTarget} />`). `collapsable: false`
 * keeps Android from flattening it away, which would leave nothing to measure.
 */
export function useTourTarget(id: string, onActivate?: () => void) {
  const registry = useContext(TourTargetContext);
  const ref = useRef<View | null>(null);
  const activateRef = useRef(onActivate);

  useEffect(() => {
    activateRef.current = onActivate;
  }, [onActivate]);

  useEffect(() => {
    if (!registry) return;
    return registry.register(id, { ref, activate: () => activateRef.current?.() });
  }, [registry, id]);

  return { ref, collapsable: false } as const;
}

type TourTargetProps = ViewProps & {
  id: string;
  onActivate?: () => void;
  children: ReactNode;
};

/** A wrapping View registered as a target, for when there is no View to reuse. */
export function TourTarget({ id, onActivate, children, ...viewProps }: TourTargetProps) {
  const target = useTourTarget(id, onActivate);
  return (
    <View {...viewProps} {...target}>
      {children}
    </View>
  );
}
