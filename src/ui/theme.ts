import { Platform, useColorScheme } from 'react-native';

export type Theme = {
  dark: boolean;
  color: {
    background: string;
    surface: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    accentText: string;
    accentSoft: string;
    danger: string;
    success: string;
  };
  space: (steps: number) => number;
  radius: { sm: number; md: number; lg: number };
  font: { regular: string | undefined; mono: string | undefined };
};

const BASE_UNIT = 8;

const FONT = {
  regular: Platform.select({ android: 'sans-serif', ios: 'System', default: undefined }),
  mono: Platform.select({ android: 'monospace', ios: 'Menlo', default: undefined }),
};

const LIGHT: Theme['color'] = {
  background: '#FFFFFF',
  surface: '#F3F4F6',
  border: '#E2E4E9',
  text: '#101114',
  muted: '#61646C',
  accent: '#1D4ED8',
  accentText: '#FFFFFF',
  accentSoft: '#E8EEFC',
  danger: '#B42318',
  success: '#146C43',
};

const DARK: Theme['color'] = {
  background: '#0E0F12',
  surface: '#17191E',
  border: '#262A31',
  text: '#F2F3F5',
  muted: '#9A9EA8',
  accent: '#6E9BFF',
  accentText: '#0E0F12',
  accentSoft: '#1B2333',
  danger: '#FF8A7A',
  success: '#6ED09A',
};

export function useTheme(): Theme {
  const dark = useColorScheme() === 'dark';
  return {
    dark,
    color: dark ? DARK : LIGHT,
    space: (steps: number) => steps * BASE_UNIT,
    radius: { sm: 8, md: 14, lg: 20 },
    font: FONT,
  };
}
