// Premium cinematic monochrome theme - pure black and white with grainy texture
import { useColorScheme } from 'react-native';

// Light theme - modern grainy white
export const lightColors = {
  background: '#F5F5F5',
  backgroundGrain: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceLight: '#F9F9F9',
  primary: '#000000', // Pure black for accents
  primaryLight: '#1A1A1A',
  primaryDark: '#000000',
  text: '#1F1F1F',
  textSecondary: '#6B6B6B',
  textTertiary: '#9A9A9A',
  accent: '#2A2A2A', // Dark gray instead of red
  success: '#1A1A1A', // Dark gray instead of green
  warning: '#4A4A4A', // Medium gray instead of orange
  border: '#E5E5E5',
  borderLight: '#F3F3F3',
  cardBackground: '#FFFFFF',
  shadow: 'rgba(0, 0, 0, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.5)',
};

// Dark theme - grainy dark with premium cinematic feel
export const darkColors = {
  background: '#0A0A0A', // Pure black with slight variation for grainy texture
  backgroundGrain: '#0F0F0F', // Slightly lighter for grain effect
  surface: '#1A1A1A',
  surfaceElevated: '#252525',
  surfaceLight: '#1F1F1F',
  primary: '#FFFFFF', // Pure white for accents
  primaryLight: '#E5E5E5',
  primaryDark: '#FFFFFF',
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textTertiary: '#707070',
  accent: '#E0E0E0', // Light gray instead of red
  success: '#D0D0D0', // Light gray instead of green
  warning: '#A0A0A0', // Medium gray instead of orange
  border: '#2A2A2A',
  borderLight: '#333333',
  cardBackground: '#1F1F1F',
  shadow: 'rgba(0, 0, 0, 0.5)',
  overlay: 'rgba(0, 0, 0, 0.8)',
};

// Get current theme colors
export const getThemeColors = (isDark = false) => {
  return isDark ? darkColors : lightColors;
};

// Default to dark theme for premium cinematic feel
export const colors = darkColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  bodyMedium: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  button: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
};

export const borderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
};
