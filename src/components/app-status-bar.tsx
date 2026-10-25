/**
 * The app's status bar. Use this, never expo-status-bar directly (ESLint
 * enforces it outside this file).
 *
 * iOS 27 turned `-[UIApplication setStatusBarStyle:]` into a no-op, and that is
 * the only API React Native's StatusBar — and so expo-status-bar — uses on iOS.
 * The light and dark themes stopped steering the status bar: it followed the
 * phone's appearance instead, so a yellow theme in dark mode got white text on
 * a bright header. On iOS this sets the style through the root view controller
 * instead (modules/status-bar-style), which needs
 * `UIViewControllerBasedStatusBarAppearance` = YES in app.config.js — and with
 * that key YES, React Native's StatusBar raises an error on every call, which is
 * why nothing may render expo-status-bar on iOS any more.
 *
 * Android, and any iOS build without the native module, render expo-status-bar
 * as before.
 *
 * Behaves like expo-status-bar: the most recently mounted instance wins, and
 * unmounting one restores the one below it. `auto` means light content in dark
 * mode and dark content in light mode; `inverted` the opposite.
 */
import { StatusBar, type StatusBarProps, type StatusBarStyle } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { Platform, useColorScheme } from 'react-native';

import NativeStatusBarStyle from '@/modules/status-bar-style';
import { logger } from '@/src/utils/logger';

type ResolvedStyle = 'light' | 'dark';

interface Entry {
  style: ResolvedStyle;
  animated: boolean;
}

/** Mounted iOS status bars, oldest first. The last one is shown. */
const stack: Entry[] = [];

function applyTop(): void {
  const top = stack[stack.length - 1];
  NativeStatusBarStyle?.setStyle(top?.style ?? 'default', top?.animated ?? false)
    .catch(logger.catchAsync('status_bar_style'));
}

export function resolveStatusBarStyle(
  style: StatusBarStyle | undefined,
  colorScheme: string | null | undefined,
): ResolvedStyle {
  if (style === 'light' || style === 'dark') return style;
  const auto: ResolvedStyle = colorScheme === 'dark' ? 'light' : 'dark';
  if (style === 'inverted') return auto === 'light' ? 'dark' : 'light';
  return auto;
}

function IOSStatusBar({ style, animated = false }: Pick<StatusBarProps, 'style' | 'animated'>) {
  const colorScheme = useColorScheme();
  const resolved = resolveStatusBarStyle(style, colorScheme);
  const entry = useRef<Entry | null>(null);

  // Join the stack on mount (and again if a dev re-mount took us out of it),
  // otherwise update in place so a style change keeps this instance's position.
  useEffect(() => {
    if (!entry.current) entry.current = { style: resolved, animated };
    entry.current.style = resolved;
    entry.current.animated = animated;
    if (!stack.includes(entry.current)) stack.push(entry.current);
    if (stack[stack.length - 1] === entry.current) applyTop();
  }, [resolved, animated]);

  useEffect(
    () => () => {
      const index = entry.current ? stack.indexOf(entry.current) : -1;
      if (index >= 0) stack.splice(index, 1);
      applyTop();
    },
    [],
  );

  return null;
}

export function AppStatusBar(props: StatusBarProps) {
  if (Platform.OS === 'ios' && NativeStatusBarStyle) {
    return <IOSStatusBar style={props.style} animated={props.animated} />;
  }
  return <StatusBar {...props} />;
}

/** @internal Test hook: the iOS stack, oldest first. */
export const __statusBarStackForTests = stack;
