import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

import { findFormat } from '../formats';
import {
  MediaError,
  cancel as cancelConversion,
  canOpenResult,
  canPickSource,
  canShareResult,
  convert,
  getInitialShare,
  isAvailable,
  isCancellation,
  onProgress,
  onShare,
  openResult,
  pickSource,
  shareResult,
  toMediaError,
  type ConvertOptions,
  type FormatId,
} from '../media';
import { initialState, reducer, type ScreenState } from './state';

/**
 * Вся связь экрана с мостом. Компоненты остаются без асинхронщины:
 * они получают состояние и четыре действия.
 */

export type Converter = {
  state: ScreenState;
  /** Пикер есть в сборке: без него кнопка выбора не показывается. */
  canPick: boolean;
  /** Пикер открыт — второе нажатие ничего не даст. */
  picking: boolean;
  canShare: boolean;
  canOpen: boolean;
  /** Открыть системный выбор видео. */
  pick: () => void;
  selectFormat: (format: FormatId) => void;
  start: () => void;
  requestCancel: () => void;
  share: () => void;
  open: () => void;
  /** Из ошибки — обратно к выбору формата (или к пустому экрану). */
  retry: () => void;
  /** Забыть текущий файл и вернуться к началу. */
  clear: () => void;
};

function optionsFor(format: FormatId): ConvertOptions | undefined {
  const bitrateKbps = findFormat(format)?.defaultBitrateKbps;
  return bitrateKbps === undefined ? undefined : { bitrateKbps };
}

/**
 * На Android 8–9 запись в общую папку требует рантайм-разрешения; с Android 10
 * его отменил Scoped Storage, и запрашивать там нечего — система откажет молча.
 * Диалог показывает UI: нативный слой про Activity и разрешения не знает.
 */
async function ensureStorageAccess(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version >= 29) {
    return;
  }
  const permission = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
  if (await PermissionsAndroid.check(permission)) {
    return;
  }
  const granted = await PermissionsAndroid.request(permission, {
    title: 'Куда сохранить звук',
    message: 'rec.verter кладёт готовый файл в папку Музыка/rec.verter. Для этого нужен доступ к памяти.',
    buttonPositive: 'Разрешить',
    buttonNegative: 'Не сейчас',
  });
  if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new MediaError('STORAGE_PERMISSION_DENIED');
  }
}

export function useConverter(): Converter {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Открытый пикер — не состояние конвертации, а положение системного окна
  // поверх экрана: в конечный автомат ему незачем.
  const [picking, setPicking] = useState(false);

  // Действия читают актуальное состояние отсюда: иначе колбэки пришлось бы
  // пересоздавать на каждый тик прогресса.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Номер запуска: результат отменённой конвертации не должен перебить экран.
  const runRef = useRef(0);

  // Защёлка от второго нажатия, пока системный пикер уже открывается.
  const pickingRef = useRef(false);

  useEffect(() => {
    if (!isAvailable()) {
      dispatch({ type: 'module-unavailable' });
      return;
    }

    let alive = true;
    getInitialShare()
      .then((source) => {
        if (alive && source) {
          dispatch({ type: 'source-received', source });
        }
      })
      .catch((cause: unknown) => {
        if (alive) {
          const error = toMediaError(cause);
          dispatch({ type: 'failed', code: error.code, message: error.humanMessage });
        }
      });

    const stopShare = onShare((source) => dispatch({ type: 'source-received', source }));
    const stopProgress = onProgress((progress) => dispatch({ type: 'progressed', progress }));

    return () => {
      alive = false;
      stopShare();
      stopProgress();
    };
  }, []);

  const fail = useCallback((cause: unknown) => {
    const error = toMediaError(cause);
    // Отмена — не поломка: экран просто возвращается к выбору формата.
    dispatch(
      isCancellation(error)
        ? { type: 'reset-to-source' }
        : { type: 'failed', code: error.code, message: error.humanMessage },
    );
  }, []);

  const pick = useCallback(() => {
    if (pickingRef.current) {
      return;
    }
    pickingRef.current = true;
    setPicking(true);
    pickSource()
      .then((source) => {
        // null — человек закрыл пикер. Экран остаётся как был, без красной
        // плашки: отменённый выбор ничего не сломал.
        if (source) {
          dispatch({ type: 'source-received', source });
        }
      })
      .catch(fail)
      .finally(() => {
        pickingRef.current = false;
        setPicking(false);
      });
  }, [fail]);

  const selectFormat = useCallback((format: FormatId) => {
    dispatch({ type: 'format-selected', format });
  }, []);

  const start = useCallback(() => {
    const current = stateRef.current;
    if (current.kind !== 'ready') {
      return;
    }
    const { source, format } = current;
    const run = runRef.current + 1;
    runRef.current = run;
    dispatch({ type: 'started' });

    ensureStorageAccess()
      .then(() => convert(source.uri, format, optionsFor(format)))
      .then((result) => {
        if (run === runRef.current) {
          dispatch({ type: 'succeeded', result });
        }
      })
      .catch((cause: unknown) => {
        if (run === runRef.current) {
          fail(cause);
        }
      });
  }, [fail]);

  const requestCancel = useCallback(() => {
    if (stateRef.current.kind !== 'working') {
      return;
    }
    dispatch({ type: 'cancel-requested' });
    // Ответ придёт кодом CANCELLED из convert(); отдельная обработка не нужна.
    cancelConversion().catch(() => undefined);
  }, []);

  const share = useCallback(() => {
    const current = stateRef.current;
    if (current.kind === 'done') {
      shareResult(current.result).catch(fail);
    }
  }, [fail]);

  const open = useCallback(() => {
    const current = stateRef.current;
    if (current.kind === 'done') {
      openResult(current.result).catch(fail);
    }
  }, [fail]);

  const retry = useCallback(() => {
    dispatch({ type: 'reset-to-source' });
  }, []);

  // Нужен там, где повтор бессмысленен, а пикера в сборке нет: файл убирается,
  // и экран возвращается к инструкции про «Поделиться» — единственному входу.
  const clear = useCallback(() => {
    dispatch({ type: 'source-cleared' });
  }, []);

  return {
    state,
    canPick: canPickSource(),
    picking,
    canShare: canShareResult(),
    canOpen: canOpenResult(),
    pick,
    selectFormat,
    start,
    requestCancel,
    share,
    open,
    retry,
    clear,
  };
}
