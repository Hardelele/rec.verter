import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { findFormat } from '../formats';
import type { ConvertResult, SharedSource } from '../media';
import { Body, Button, Card, Facts, Row, Title } from './controls';
import { FormatList } from './FormatList';
import { RESULT_LOCATION, formatDuration, formatSize, joinFacts, resultFileName } from './human';
import { useTheme } from './theme';
import { useConverter } from './useConverter';

/**
 * Единственный экран приложения. Пять состояний, между ними — переходы
 * из useConverter. Навигации нет и не нужно: путь «файл → формат → результат»
 * укладывается в два касания.
 */

function sourceFacts(source: SharedSource): string {
  return joinFacts([formatDuration(source.durationMs), formatSize(source.sizeBytes)]);
}

function resultFacts(result: ConvertResult): string {
  return joinFacts([formatDuration(result.durationMs), formatSize(result.sizeBytes)]);
}

function SourceCard({ source }: { source: SharedSource }) {
  const theme = useTheme();
  const facts = sourceFacts(source);
  return (
    <Card>
      <Text
        numberOfLines={2}
        style={{
          color: theme.color.text,
          fontFamily: theme.font.regular,
          fontSize: 17,
          fontWeight: '600',
        }}>
        {source.name}
      </Text>
      {facts ? <Facts>{facts}</Facts> : <Body tone="muted">Длительность станет известна при извлечении.</Body>}
    </Card>
  );
}

/** Полоса прогресса без анимационных библиотек: ширина от значения 0..1. */
function Progress({ value }: { value?: number }) {
  const theme = useTheme();
  if (value === undefined) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(1) }}>
        <ActivityIndicator color={theme.color.accent} />
        <Body tone="muted">Читаем файл…</Body>
      </View>
    );
  }
  return (
    <View style={{ gap: theme.space(0.5) }}>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.color.border,
          overflow: 'hidden',
        }}>
        <View
          style={{
            width: `${Math.round(value * 100)}%`,
            height: '100%',
            backgroundColor: theme.color.accent,
          }}
        />
      </View>
      <Facts>{`${Math.round(value * 100)} %`}</Facts>
    </View>
  );
}

function Step({ index, text }: { index: number; text: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.space(1.5), alignItems: 'flex-start' }}>
      <Text
        style={{
          color: theme.color.accent,
          fontFamily: theme.font.mono,
          fontSize: 15,
          fontWeight: '700',
          lineHeight: 22,
          minWidth: 18,
        }}>
        {index}
      </Text>
      <View style={{ flex: 1 }}>
        <Body>{text}</Body>
      </View>
    </View>
  );
}

export function Screen() {
  const theme = useTheme();
  const { state, canShare, canOpen, selectFormat, start, requestCancel, share, open, retry } =
    useConverter();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.background }}
      contentContainerStyle={{
        padding: theme.space(2.5),
        paddingBottom: theme.space(5),
        gap: theme.space(2.5),
      }}>
      <View style={{ gap: 4 }}>
        <Title>rec.verter</Title>
        <Body tone="muted">Звук из видео — на самом телефоне. Ничего не уходит наружу.</Body>
      </View>

      {state.kind === 'unavailable' && (
        <Card>
          <Body tone="danger">Нативный модуль недоступен</Body>
          <Body tone="muted">
            Извлечение звука выполняет нативный код, а он есть только в нативной сборке. В Expo Go и
            в браузере экран открывается, но конвертировать нечем.
          </Body>
          <Body tone="muted">Соберите приложение командой npm run android.</Body>
        </Card>
      )}

      {state.kind === 'empty' && (
        <>
          <Card>
            <Body>Пришлите видео в приложение — звук вернётся файлом.</Body>
            <View style={{ gap: theme.space(1), marginTop: theme.space(0.5) }}>
              <Step index={1} text="Откройте видео в галерее, Telegram или файлах." />
              <Step index={2} text="Нажмите «Поделиться»." />
              <Step index={3} text="Выберите rec.verter в списке приложений." />
            </View>
          </Card>
          <Body tone="muted">
            Разрешения на интернет у приложения нет вообще, поэтому отправить файл куда-либо оно не
            может физически.
          </Body>
        </>
      )}

      {state.kind === 'ready' && (
        <>
          <SourceCard source={state.source} />
          <FormatList selected={state.format} onSelect={selectFormat} />
          <Button
            label="Извлечь звук"
            onPress={start}
            hint={`Формат ${findFormat(state.format)?.title ?? state.format}`}
          />
        </>
      )}

      {state.kind === 'working' && (
        <>
          <SourceCard source={state.source} />
          <Card>
            <Body>
              {state.cancelling
                ? 'Останавливаем…'
                : `Извлекаем ${findFormat(state.format)?.title ?? state.format}`}
            </Body>
            <Progress value={state.progress} />
          </Card>
          <Button label="Отменить" tone="quiet" onPress={requestCancel} disabled={state.cancelling} />
        </>
      )}

      {state.kind === 'done' && (
        <>
          <Card>
            <Body tone="muted">{`Сохранено в ${RESULT_LOCATION}`}</Body>
            <Text
              numberOfLines={2}
              style={{
                color: theme.color.text,
                fontFamily: theme.font.regular,
                fontSize: 17,
                fontWeight: '600',
              }}>
              {resultFileName(
                state.source.name,
                findFormat(state.format)?.extension ?? state.format,
              )}
            </Text>
            <Facts>{resultFacts(state.result)}</Facts>
          </Card>
          {(canShare || canOpen) && (
            <Row>
              {canShare && (
                <View style={{ flex: 1 }}>
                  <Button label="Поделиться" onPress={share} />
                </View>
              )}
              {canOpen && (
                <View style={{ flex: 1 }}>
                  <Button label="Открыть" tone="secondary" onPress={open} />
                </View>
              )}
            </Row>
          )}
          <Button label="Другой формат" tone="quiet" onPress={retry} />
        </>
      )}

      {state.kind === 'error' && (
        <>
          {state.source && <SourceCard source={state.source} />}
          <Card style={{ borderColor: theme.color.danger, borderWidth: StyleSheet.hairlineWidth }}>
            <Body tone="danger">{state.message}</Body>
          </Card>
          <Button label={state.source ? 'Попробовать снова' : 'Понятно'} onPress={retry} />
        </>
      )}
    </ScrollView>
  );
}
