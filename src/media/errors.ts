import { ERROR_CODES, type ErrorCode, type MediaErrorCode } from './types';

/**
 * Мост возвращает коды. Человеческий текст — только здесь: одно место на
 * приложение, и перевод делается тоже здесь.
 */
const MESSAGES: Record<MediaErrorCode, string> = {
  NO_AUDIO_TRACK: 'В этом файле нет звуковой дорожки — извлекать нечего.',
  UNSUPPORTED_CONTAINER: 'Такой контейнер система прочитать не умеет. Попробуйте MP4, MKV или MOV.',
  CORRUPTED_SOURCE: 'Файл повреждён или скачался не полностью.',
  NO_SPACE: 'На устройстве не хватает места. Освободите немного и повторите.',
  CANCELLED: 'Конвертация отменена.',
  UNSUPPORTED_FORMAT: 'Этот формат пока не поддерживается.',
  MODULE_UNAVAILABLE: 'Нативный модуль недоступен: приложение запущено без нативной сборки.',
  STORAGE_PERMISSION_DENIED:
    'Без доступа к памяти сохранить файл некуда. Разрешите его в настройках приложения и повторите.',
  UNKNOWN: 'Не получилось достать звук. Попробуйте ещё раз.',
};

/** Ошибка отмены не является поломкой: экран возвращается в исходное состояние. */
export function isCancellation(error: MediaError): boolean {
  return error.code === 'CANCELLED';
}

export class MediaError extends Error {
  readonly code: MediaErrorCode;
  /** Техническая подробность от моста — для разработчика, не для экрана. */
  readonly detail?: string;

  constructor(code: MediaErrorCode, detail?: string) {
    super(MESSAGES[code]);
    this.name = 'MediaError';
    this.code = code;
    this.detail = detail;
  }

  /** Текст, который не стыдно показать человеку. */
  get humanMessage(): string {
    return MESSAGES[this.code];
  }
}

function isKnownCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

/** Любое исключение с границы моста приводится к MediaError. */
export function toMediaError(cause: unknown): MediaError {
  if (cause instanceof MediaError) {
    return cause;
  }
  if (cause && typeof cause === 'object') {
    const code = (cause as { code?: unknown }).code;
    const message = (cause as { message?: unknown }).message;
    const detail = typeof message === 'string' ? message : undefined;
    if (isKnownCode(code)) {
      return new MediaError(code, detail);
    }
    return new MediaError('UNKNOWN', detail ?? (typeof code === 'string' ? code : undefined));
  }
  return new MediaError('UNKNOWN', typeof cause === 'string' ? cause : undefined);
}
