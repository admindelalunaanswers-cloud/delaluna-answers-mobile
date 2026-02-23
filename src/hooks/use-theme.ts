import { useContext } from 'react';

import { ThemeContext, type ThemeContextType } from '@/src/context/theme-context';

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
