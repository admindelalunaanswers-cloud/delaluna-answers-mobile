/**
 * Layout utilities for responsive design across phone and tablet screen sizes.
 *
 * This app targets phones but is also reviewed on iPad. Content should stay in
 * a phone-like column (≤ MAX_CONTENT_WIDTH) centered on wider screens, rather
 * than stretching edge to edge.
 */

/** Logical-pixel width of the widest supported phone (iPhone Pro Max). */
export const MAX_CONTENT_WIDTH = 430;

/** Screens at or above this width are treated as tablets. */
export const TABLET_BREAKPOINT = 600;

/** Returns true when the screen is tablet-sized. */
export const isTablet = (screenWidth: number): boolean =>
  screenWidth >= TABLET_BREAKPOINT;

/**
 * Returns the horizontal padding to apply to a scroll content container so
 * the content stays within a MAX_CONTENT_WIDTH column, centered on the screen.
 *
 * @param screenWidth  Real device/window width in logical pixels.
 * @param base         Minimum inner padding (default 16). Applied on phones;
 *                     used as the inner gutter on tablets.
 *
 * @example
 *   // Phone 375 px  →  16 px each side  →  343 px content
 *   // iPad  768 px  → 169 px each side  →  430 px content (centered)
 *   // iPad 1024 px  → 297 px each side  →  430 px content (centered)
 */
export const getContentPadding = (screenWidth: number, base = 16): number => {
  if (screenWidth <= MAX_CONTENT_WIDTH) return base;
  return Math.max(base, Math.floor((screenWidth - MAX_CONTENT_WIDTH) / 2));
};
