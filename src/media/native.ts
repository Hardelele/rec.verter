import { NativeEventEmitter, NativeModules } from 'react-native';

import type { ConvertOptions, ConvertResult, FormatId, SharedSource } from './types';

/**
 * Единственное место во всём TypeScript, где встречается NativeModules.
 * Всё остальное приложение работает с функциями из ./index.
 */

export const PROGRESS_EVENT = 'recverter:progress';
export const SHARE_EVENT = 'recverter:share';

type RecverterNativeModule = {
  convert(sourceUri: string, format: FormatId, options?: ConvertOptions): Promise<ConvertResult>;
  cancel(): Promise<void> | void;
  getInitialShare(): Promise<SharedSource | null>;
  /**
   * Необязательные методы: без них экран прячет соответствующие кнопки,
   * а не падает. Отдать файл в другое приложение из JS нечем — системный
   * Share на Android умеет только текст, а тащить зависимость ради
   * двух кнопок дороже, чем два метода в мосту.
   *
   * pickSource — системный выбор видео. Отмена не ошибка: мост возвращает
   * null либо отклоняет обещание кодом CANCELLED, экран понимает оба ответа.
   */
  pickSource?(): Promise<SharedSource | null>;
  shareResult?(path: string, mimeType: string): Promise<void>;
  openResult?(path: string, mimeType: string): Promise<void>;
  addListener?(eventName: string): void;
  removeListeners?(count: number): void;
};

const nativeModule: RecverterNativeModule | undefined =
  (NativeModules as Record<string, RecverterNativeModule | undefined>).Recverter ?? undefined;

let emitter: NativeEventEmitter | undefined;

/** Эмиттер создаётся лениво: без модуля он бросит на конструкторе. */
export function getEmitter(): NativeEventEmitter | undefined {
  if (!nativeModule) {
    return undefined;
  }
  if (!emitter) {
    emitter = new NativeEventEmitter(nativeModule as never);
  }
  return emitter;
}

export function getNativeModule(): RecverterNativeModule | undefined {
  return nativeModule;
}

export function hasNativeModule(): boolean {
  return nativeModule !== undefined;
}

export function hasMethod(name: 'pickSource' | 'shareResult' | 'openResult'): boolean {
  return typeof nativeModule?.[name] === 'function';
}
