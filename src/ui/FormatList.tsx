import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FORMATS, type FormatDescriptor, type FormatId } from '../formats';
import { useTheme } from './theme';

/**
 * Список рисуется из FORMATS. Новый формат — строка в данных, а не карточка
 * в разметке, поэтому здесь нет ни одного упоминания m4a, wav или mp3.
 */

function FormatRow({
  format,
  selected,
  onSelect,
}: {
  format: FormatDescriptor;
  selected: boolean;
  onSelect: (id: FormatId) => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${format.title}. ${format.speed}, ${format.quality}`}
      accessibilityHint={format.hint}
      onPress={() => onSelect(format.id)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.space(1.5),
        minHeight: 56,
        padding: theme.space(1.5),
        borderRadius: theme.radius.md,
        borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        borderColor: selected ? theme.color.accent : theme.color.border,
        backgroundColor: selected ? theme.color.accentSoft : 'transparent',
        opacity: pressed ? 0.75 : 1,
      })}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            color: theme.color.text,
            fontFamily: theme.font.regular,
            fontSize: 16,
            fontWeight: '700',
          }}>
          {format.title}
          <Text style={{ color: theme.color.muted, fontWeight: '400' }}>
            {`  ·  ${format.speed} · ${format.quality}`}
          </Text>
        </Text>
        <Text
          style={{
            color: theme.color.muted,
            fontFamily: theme.font.regular,
            fontSize: 13,
            lineHeight: 18,
          }}>
          {format.hint}
        </Text>
      </View>
      {/* Отметка выбора — символ, а не иконочный шрифт: лишней зависимости не нужно. */}
      <Text
        style={{
          color: selected ? theme.color.accent : 'transparent',
          fontFamily: theme.font.regular,
          fontSize: 18,
          fontWeight: '700',
        }}>
        ✓
      </Text>
    </Pressable>
  );
}

export function FormatList({
  selected,
  onSelect,
}: {
  selected: FormatId;
  onSelect: (id: FormatId) => void;
}) {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ gap: theme.space(1) }}>
      {FORMATS.map((format) => (
        <FormatRow
          key={format.id}
          format={format}
          selected={format.id === selected}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}
