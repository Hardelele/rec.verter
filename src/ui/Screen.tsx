import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { findFormat } from '../formats';
import { isSourceFatal, type ConvertResult, type SharedSource } from '../media';
import { Body, Button, Card, Facts, Row, Title } from './controls';
import { FormatList } from './FormatList';
import { RESULT_LOCATION, formatDuration, formatSize, joinFacts } from './human';
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

/** У результата к длительности и размеру добавляется место: это тоже факт о файле. */
function resultFacts(result: ConvertResult): string {
  return joinFacts([
    formatDuration(result.durationMs),
    formatSize(result.sizeBytes),
    RESULT_LOCATION,
  ]);
}

/** Имя файла — самая крупная строка карточки: по нему человек и опознаёт файл. */
function FileName({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={2}
      style={{
        color: theme.color.text,
        fontFamily: theme.font.regular,
        fontSize: 17,
        fontWeight: '600',
      }}>
      {children}
    </Text>
  );
}

function SourceCard({ source }: { source: SharedSource }) {
  const facts = sourceFacts(source);
  // Длительность провайдер отдаёт не всегда, а размер — почти всегда. Пояснение
  // привязано к отсутствию длительности, а не к пустоте всей строки: иначе оно
  // не показывается ровно в том случае, ради которого написано.
  const durationUnknown = formatDuration(source.durationMs) === undefined;
  return (
    <Card>
      <FileName>{source.name}</FileName>
      {facts ? <Facts>{facts}</Facts> : null}
      {durationUnknown ? <Body tone="muted">Длительность станет известна при извлечении.</Body> : null}
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
          // Трек — не декорация: по нему видно, где у полосы конец.
          backgroundColor: theme.color.borderStrong,
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
      <Facts mono>{`${Math.round(value * 100)} %`}</Facts>
    </View>
  );
}

function Step({ index, text, muted }: { index: number; text: string; muted: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.space(1.5), alignItems: 'flex-start' }}>
      <Text
        style={{
          // Номера шагов приглушены намеренно: акцентный цвет на экране один,
          // и он принадлежит кнопке выбора видео.
          color: theme.color.muted,
          fontFamily: theme.font.mono,
          fontSize: 15,
          fontWeight: '700',
          lineHeight: 22,
          minWidth: 18,
        }}>
        {index}
      </Text>
      <View style={{ flex: 1 }}>
        <Body tone={muted ? 'muted' : undefined}>{text}</Body>
      </View>
    </View>
  );
}

/**
 * Путь через «Поделиться» никуда не делся: когда видео уже открыто в галерее
 * или в мессенджере, отдать его оттуда быстрее, чем искать в пикере. Поэтому
 * подсказка остаётся — но советом рядом с главным действием, а не вместо него.
 *
 * `muted` — это и есть «советом»: когда путь понижен в правах, приглушается
 * весь блок целиком, а не одна подводка. Иначе понижённый путь набран самым
 * тёмным цветом и занимает больше места, чем главная кнопка, и глаз идёт к
 * нему первым. Кегль при этом не трогаем: подсказку читают, а не просматривают.
 */
function ShareHint({ lead, muted }: { lead: string; muted: boolean }) {
  const theme = useTheme();
  return (
    <Card>
      <Body tone={muted ? 'muted' : undefined} strong={!muted}>
        {lead}
      </Body>
      <View style={{ gap: theme.space(1), marginTop: theme.space(0.5) }}>
        <Step muted={muted} index={1} text="Откройте видео в галерее, Telegram или файлах." />
        <Step muted={muted} index={2} text="Нажмите «Поделиться»." />
        <Step muted={muted} index={3} text="Выберите rec.verter в списке приложений." />
      </View>
    </Card>
  );
}

export function Screen() {
  const theme = useTheme();
  const {
    state,
    canPick,
    picking,
    canShare,
    canOpen,
    pick,
    selectFormat,
    start,
    requestCancel,
    share,
    open,
    retry,
    clear,
  } = useConverter();

  // Код ошибки решает, какое действие вообще имеет смысл предлагать.
  const errorCode = state.kind === 'error' ? state.code : undefined;
  const fatalSource = errorCode !== undefined && isSourceFatal(errorCode);
  // Открывать нечем — не предлагаем: пикер уже отказался открыться.
  const offerPick = canPick && errorCode !== 'PICKER_UNAVAILABLE';

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
          {/*
            Главное действие — одно, и оно первое на экране. Пикер живёт в
            нативном модуле и появился позже остального моста: в старой сборке
            метода нет, и тогда экран честно остаётся инструкцией про
            «Поделиться», а не показывает кнопку, которой нечем ответить.
          */}
          {canPick && (
            <Button
              label={picking ? 'Открываем галерею…' : 'Выбрать видео'}
              onPress={pick}
              disabled={picking}
              hint="Откроется системный выбор файла"
            />
          )}

          <ShareHint
            muted={canPick}
            lead={
              canPick
                ? 'Видео уже открыто в галерее или мессенджере? Оттуда быстрее — через «Поделиться».'
                : 'Пришлите видео в приложение — звук вернётся файлом.'
            }
          />

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
          {/*
            Успех должен быть виден с расстояния вытянутой руки, поэтому у
            карточки результата свой цвет — единственное место, где вообще
            используется `success`. Без него `done` и `ready` — две одинаковые
            серые карточки, и «получилось» приходится вычитывать.
          */}
          <Card style={{ borderColor: theme.color.success, borderWidth: 1 }}>
            <Body tone="success" strong>
              Готово
            </Body>
            <FileName>{state.result.displayName}</FileName>
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
          {/*
            Следующее видео — обычное продолжение работы, а не выход из тупика:
            раньше отсюда можно было только сменить формат того же файла, и за
            новым приходилось выходить из приложения. Действие второстепенное:
            главное здесь — забрать то, что уже готово.
          */}
          <Row>
            <View style={{ flex: 1 }}>
              <Button label="Другой формат" tone="quiet" onPress={retry} />
            </View>
            {offerPick && (
              <View style={{ flex: 1 }}>
                <Button
                  label={picking ? 'Открываем…' : 'Другое видео'}
                  tone="quiet"
                  onPress={pick}
                  disabled={picking}
                  hint="Откроется системный выбор файла"
                />
              </View>
            )}
          </Row>
        </>
      )}

      {state.kind === 'error' && (
        <>
          {state.source && <SourceCard source={state.source} />}
          <Card style={{ borderColor: theme.color.danger, borderWidth: 1 }}>
            <Body tone="danger" strong>
              {state.message}
            </Body>
            {fatalSource && (
              <Body tone="muted">
                Дело в самом файле: тот же файл в другом формате даст ту же ошибку.
              </Body>
            )}
          </Card>
          {/*
            Что предложить, решает код ошибки. Нехватка места лечится повтором,
            отсутствие звуковой дорожки — нет: «Попробовать снова» там вернуло бы
            к тому же файлу и к той же ошибке, то есть в тупик. Поэтому на
            неустранимой ошибке главное действие — взять другой файл.
          */}
          {fatalSource ? (
            offerPick ? (
              <Button
                label={picking ? 'Открываем галерею…' : 'Выбрать другое видео'}
                onPress={pick}
                disabled={picking}
                hint="Откроется системный выбор файла"
              />
            ) : (
              <Button
                label="Начать сначала"
                onPress={clear}
                hint="Экран вернётся к началу, откуда видео можно прислать через «Поделиться»"
              />
            )
          ) : (
            <>
              {state.source ? (
                <Button label="Попробовать снова" onPress={retry} />
              ) : (
                <Button label="Понятно" onPress={clear} />
              )}
              {offerPick && (
                <Button
                  label={picking ? 'Открываем галерею…' : 'Выбрать другое видео'}
                  tone="quiet"
                  onPress={pick}
                  disabled={picking}
                  hint="Откроется системный выбор файла"
                />
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
