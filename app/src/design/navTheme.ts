/**
 * The navigator's own palette.
 *
 * React Navigation paints the ground *behind* every screen from its theme, and
 * its default is a near-white `#F2F2F2`. Nothing shows that ground while a
 * single opaque screen is on top — but a tab cross-fade puts both scenes at
 * partial opacity at the same time, and for those few frames the white comes
 * through as a flash between Home and Clients.
 *
 * So the container gets a theme built from the same tokens the screens use.
 * The screens were always dark; the floor under them was not.
 */

import { DarkTheme, type Theme } from '@react-navigation/native';
import { colors } from './tokens';

export const navTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accentText,
    background: colors.canvas,
    card: colors.surface,
    text: colors.ink,
    border: colors.line,
    notification: colors.danger,
  },
};
