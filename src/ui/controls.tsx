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

export function Body({
  children,
  tone,
  strong,
}: {
  children: ReactNode;
  tone?: 'muted' | 'danger' | 'success';
  /** Вес, а не кегль: понизить текст в правах можно цветом, повысить — весом. */
  strong?: boolean;
}) {
  const theme = useTheme();
  const color =
    tone === 'danger'
      ? theme.color.danger
      : tone === 'success'
        ? theme.color.success
        : tone === 'muted'
          ? theme.color.muted
          : theme.color.text;
  return (
    <Text
      style={{
        color,
        fontFamily: theme.font.regular,
        fontSize: 15,
        lineHeight: 22,
        fontWeight: strong ? '700' : '400',
      }}>
      {children}
    </Text>
  );
}

/**
 * Факты о файле: длительность, размер, место.
 *
 * Моноширинный — только там, где цифры меняются на глазах и не должны прыгать,
 * то есть у процента конвертации. У неподвижной строки повода нет, а вред есть:
 * в моноширинном пробел шире буквы, и «270 КБ» читается как «270  КБ», то есть
 * как опечатка. Поэтому `mono` включается по месту, а не по умолчанию.
 */
export function Facts({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        color: theme.color.muted,
        fontFamily: mono ? theme.font.mono : theme.font.regular,
        fontSize: 13,
        lineHeight: 18,
      }}>
      {children}
    </Text>
  );
}

function toneStyles(theme: Theme, tone: ButtonTone, pressed: boolean, disabled: boolean) {
  const base = {
    primary: { background: theme.color.accent, label: theme.color.accentText, border: 'transparent' },
    // Заливка `accentSoft` почти не отличается от фона, а у `quiet` её нет
    // вовсе: у обеих кнопок форму держит рамка, поэтому она контрастная.
    secondary: {
      background: theme.color.accentSoft,
      label: theme.color.accent,
      border: theme.color.borderStrong,
    },
    quiet: { background: 'transparent', label: theme.color.muted, border: theme.color.borderStrong },
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
          // Волосяная линия на плотном экране — треть точки: у кнопки, форма
          // которой держится только на рамке, её должно быть видно.
          borderWidth: tone === 'primary' ? 0 : 1,
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
