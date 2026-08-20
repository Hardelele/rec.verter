/**
 * Типы контракта моста. Здесь нет ни одного обращения к NativeModules —
 * только форма данных, которой обмениваются TypeScript и Kotlin.
 */

export type FormatId = 'm4a' | 'wav' | 'mp3';

export type ConvertOptions = {
  /** только mp3, по умолчанию 192 */
  bitrateKbps?: number;
  /** приведение к 16 кГц моно, для будущего ASR */
  mono16k?: boolean;
};

export type ConvertResult = {
  path: string;
  mimeType: string;
  durationMs: number;
  sizeBytes: number;
};

/** Файл, пришедший в приложение через «Поделиться». */
export type SharedSource = {
  uri: string;
  name: string;
  /** Может быть неизвестна до первого чтения контейнера. */
  durationMs?: number;
  sizeBytes?: number;
  mimeType?: string;
};

/** Коды, которые мост возвращает вместо текста. Текст живёт в errors.ts. */
export const ERROR_CODES = [
  'NO_AUDIO_TRACK',
  'UNSUPPORTED_CONTAINER',
  'CORRUPTED_SOURCE',
  'NO_SPACE',
  'CANCELLED',
  'UNSUPPORTED_FORMAT',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Всё, что мост не опознал, сводится сюда. */
export type MediaErrorCode = ErrorCode | 'MODULE_UNAVAILABLE' | 'UNKNOWN';

export type ProgressListener = (progress: number) => void;

export type Unsubscribe = () => void;
