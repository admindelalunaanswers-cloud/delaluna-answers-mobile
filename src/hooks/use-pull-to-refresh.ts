import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import React from 'react';

import { ThemeContext } from '@/src/context/theme-context';

/**
 * Manages pull-to-refresh state and returns a pre-configured RefreshControl
 * element ready to pass into any ScrollView or FlatList.
 *
 * Usage:
 *   const { refreshControl } = usePullToRefresh(async () => {
 *     await fetchData();
 *   });
 *   return <ScrollView refreshControl={refreshControl}>...</ScrollView>;
 */
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const { theme } = useContext(ThemeContext);
  const [refreshing, setRefreshing] = useState(false);

  // Keep a stable ref so handleRefresh never goes stale
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefreshRef.current();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const refreshControl = React.createElement(RefreshControl, {
    refreshing,
    onRefresh: handleRefresh,
    tintColor: theme.colors.primary,      // iOS spinner color
    colors: [theme.colors.primary],        // Android spinner color
  });

  return { refreshing, refreshControl };
}
