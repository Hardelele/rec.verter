import { MediaError, isCancellation, isSourceFatal, toMediaError } from './errors';
import {
  PROGRESS_EVENT,
  SHARE_EVENT,
  getEmitter,
  getNativeModule,
  hasMethod,
  hasNativeModule,
} from './native';
import type {
  ConvertOptions,
  ConvertResult,
  FormatId,
  MediaErrorCode,
  ProgressListener,
  SharedSource,
  Unsubscribe,
} from './types';

export { MediaError, isCancellation, isSourceFatal, toMediaError };
export type {
  ConvertOptions,
  ConvertResult,
  FormatId,
  MediaErrorCode,
  ProgressListener,
  SharedSource,
  Unsubscribe,
};

const NOOP: Unsubscribe = () => undefined;

/**
 * Нативный модуль есть только в нативной сборке. В Expo Go и в вебе его нет,
 * и это не повод падать: экран показывает честное «модуль недоступен».
 */
export function isAvailable(): boolean {
  return hasNativeModule();
}

/**
 * Пикер живёт в нативном модуле и появился позже остального моста, поэтому
 * метод необязательный: на старой сборке кнопка выбора просто не показывается.
 */
export function canPickSource(): boolean {
  return hasMethod('pickSource');
}

export function canShareResult(): boolean {
  return hasMethod('shareResult');
}

export function canOpenResult(): boolean {
  return hasMethod('openResult');
}

function requireModule() {
  const native = getNativeModule();
  if (!native) {
    throw new MediaError('MODULE_UNAVAILABLE');
  }
  return native;
}

/** Прогресс приходит как 0..1; всё, что вне диапазона, подрезается. */
function normalizeProgress(payload: unknown): number | undefined {
  const raw =
    typeof payload === 'number'
      ? payload
      : payload && typeof payload === 'object'
        ? ((payload as { progress?: unknown; value?: unknown }).progress ??
          (payload as { value?: unknown }).value)
        : undefined;
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    return undefined;
  }
  return Math.min(1, Math.max(0, raw));
}

/**
 * Извлечение звука. Формат — параметр, а не отдельный метод:
 * добавление формата не меняет форму вызова.
 */
export async function convert(
  sourceUri: string,
  format: FormatId,
  options?: ConvertOptions,
): Promise<ConvertResult> {
  try {
    return await requireModule().convert(sourceUri, format, options);
  } catch (cause) {
    throw toMediaError(cause);
  }
}

/** Отмена текущей конвертации. Мост завершит convert() кодом CANCELLED. */
export async function cancel(): Promise<void> {
  try {
    await requireModule().cancel();
  } catch (cause) {
    throw toMediaError(cause);
  }
}

/** Файл, с которым приложение открыли. Главный сценарий входа. */
export async function getInitialShare(): Promise<SharedSource | null> {
  if (!hasNativeModule()) {
    return null;
  }
  try {
    return (await requireModule().getInitialShare()) ?? null;
  } catch (cause) {
    throw toMediaError(cause);
  }
}

export function onProgress(listener: ProgressListener): Unsubscribe {
  const subscription = getEmitter()?.addListener(PROGRESS_EVENT, (payload: unknown) => {
    const progress = normalizeProgress(payload);
    if (progress !== undefined) {
      listener(progress);
    }
  });
  return subscription ? () => subscription.remove() : NOOP;
}

/** Файл, пришедший, пока приложение уже открыто. */
export function onShare(listener: (source: SharedSource) => void): Unsubscribe {
  const subscription = getEmitter()?.addListener(SHARE_EVENT, (payload: unknown) => {
    if (payload && typeof payload === 'object' && typeof (payload as SharedSource).uri === 'string') {
      listener(payload as SharedSource);
    }
  });
  return subscription ? () => subscription.remove() : NOOP;
}

function asSharedSource(payload: unknown): SharedSource | null {
  return payload && typeof payload === 'object' && typeof (payload as SharedSource).uri === 'string'
    ? (payload as SharedSource)
    : null;
}

/**
 * Системный выбор видео. Возвращает null, если человек закрыл пикер: отмена —
 * это решение пользователя, а не сбой, и наверх она уходит значением, а не
 * исключением. Метода нет в сборке — тоже null, кнопку туда не покажут.
 */
export async function pickSource(): Promise<SharedSource | null> {
  try {
    return asSharedSource(await requireModule().pickSource?.());
  } catch (cause) {
    const error = toMediaError(cause);
    if (isCancellation(error)) {
      return null;
    }
    throw error;
  }
}

export async function shareResult(result: ConvertResult): Promise<void> {
  try {
    await requireModule().shareResult?.(result.path, result.mimeType);
  } catch (cause) {
    throw toMediaError(cause);
  }
}

export async function openResult(result: ConvertResult): Promise<void> {
  try {
    await requireModule().openResult?.(result.path, result.mimeType);
  } catch (cause) {
    throw toMediaError(cause);
  }
}
