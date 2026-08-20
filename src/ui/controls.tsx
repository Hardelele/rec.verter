import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useTheme, type Theme } from './theme';

/**
 * Примитивы экрана. UI-кит для одного экрана не нужен: здесь ровно те три
 * элемента, из которых экран и состоит — карточка, заголовок и кнопка.
 */

export type ButtonTone = 'primary' | 'secondary' | 'quiet';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.color.surface,
          borderColor: theme.color.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: theme.radius.lg,
          padding: theme.space(2),
          gap: theme.space(1),
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: theme.color.text,
        fontFamily: theme.font.regular,
        fontSize: 24,
        fontWeight: '700',
        letterSpacing: -0.3,
      }}>
      {children}
    </Text>
  );
}

export function Body({ children, tone }: { children: ReactNode; tone?: 'muted' | 'danger' }) {
  const theme = useTheme();
  const color =
    tone === 'danger' ? theme.color.danger : tone === 'muted' ? theme.color.muted : theme.color.text;
  return (
    <Text style={{ color, fontFamily: theme.font.regular, fontSize: 15, lineHeight: 22 }}>
      {children}
    </Text>
  );
}

/** Факты о файле: моноширинный, чтобы цифры не прыгали при обновлении прогресса. */
export function Facts({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        color: theme.color.muted,
        fontFamily: theme.font.mono,
        fontSize: 13,
        letterSpacing: 0.2,
      }}>
      {children}
    </Text>
  );
}

function toneStyles(theme: Theme, tone: ButtonTone, pressed: boolean, disabled: boolean) {
  const base = {
    primary: { background: theme.color.accent, label: theme.color.accentText, border: 'transparent' },
    secondary: { background: theme.color.accentSoft, label: theme.color.accent, border: theme.color.border },
    quiet: { background: 'transparent', label: theme.color.muted, border: theme.color.border },
  }[tone];
  return {
    background: base.background,
    label: base.label,
    border: base.border,
    opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
  };
}

export function Button({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  hint,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  /** Подсказка для скринридера, когда подписи мало. */
  hint?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={hint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => {
        const colors = toneStyles(theme, tone, pressed, disabled);
        return {
          backgroundColor: colors.background,
          borderColor: colors.border,
          borderWidth: tone === 'primary' ? 0 : StyleSheet.hairlineWidth,
          borderRadius: theme.radius.md,
          opacity: colors.opacity,
          // 48 — минимальный комфортный размер касания.
          minHeight: 48,
          paddingHorizontal: theme.space(2),
          alignItems: 'center',
          justifyContent: 'center',
        };
      }}>
      {({ pressed }) => (
        <Text
          style={{
            color: toneStyles(theme, tone, pressed, disabled).label,
            fontFamily: theme.font.regular,
            fontSize: 16,
            fontWeight: '600',
          }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Кнопки в ряд: на узком экране всё равно помещаются две. */
export function Row({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const style = useMemo(() => ({ flexDirection: 'row' as const, gap: theme.space(1) }), [theme]);
  return <View style={style}>{children}</View>;
}
