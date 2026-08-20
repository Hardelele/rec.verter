import { useCallback, useEffect, useReducer, useRef } from 'react';

import { findFormat } from '../formats';
import {
  cancel as cancelConversion,
  canOpenResult,
  canShareResult,
  convert,
  getInitialShare,
  isAvailable,
  isCancellation,
  onProgress,
  onShare,
  openResult,
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
  canShare: boolean;
  canOpen: boolean;
  selectFormat: (format: FormatId) => void;
  start: () => void;
  requestCancel: () => void;
  share: () => void;
  open: () => void;
  /** Из ошибки — обратно к выбору формата (или к пустому экрану). */
  retry: () => void;
};

function optionsFor(format: FormatId): ConvertOptions | undefined {
  const bitrateKbps = findFormat(format)?.defaultBitrateKbps;
  return bitrateKbps === undefined ? undefined : { bitrateKbps };
}

export function useConverter(): Converter {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Действия читают актуальное состояние отсюда: иначе колбэки пришлось бы
  // пересоздавать на каждый тик прогресса.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Номер запуска: результат отменённой конвертации не должен перебить экран.
  const runRef = useRef(0);

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
          dispatch({ type: 'failed', message: toMediaError(cause).humanMessage });
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
        : { type: 'failed', message: error.humanMessage },
    );
  }, []);

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

    convert(source.uri, format, optionsFor(format))
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

  return {
    state,
    canShare: canShareResult(),
    canOpen: canOpenResult(),
    selectFormat,
    start,
    requestCancel,
    share,
    open,
    retry,
  };
}
