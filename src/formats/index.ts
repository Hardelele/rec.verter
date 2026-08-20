import type { FormatId } from '../media/types';

export type { FormatId };

export type FormatDescriptor = {
  id: FormatId;
  /** Название так, как его назовёт человек. */
  title: string;
  extension: string;
  mimeType: string;
  /** Честно про скорость: одна строка, без процентов и попугаев. */
  speed: string;
  /** Честно про потери и размер. */
  quality: string;
  /** Кому этот формат подходит. Помогает выбрать без чтения таблицы. */
  hint: string;
  /** Пересчитывается ли звук. m4a — нет, поэтому он первый. */
  lossless: boolean;
  /** Значение по умолчанию для mp3; для остальных не применяется. */
  defaultBitrateKbps?: number;
};

/**
 * Данные, а не ветвления. Экран рисует список отсюда, поэтому новый формат —
 * это новая строка здесь плюс поддержка в мосту, и ни строчки в UI.
 * Порядок значим: сверху то, что не трогает звук.
 */
export const FORMATS: readonly FormatDescriptor[] = [
  {
    id: 'm4a',
    title: 'M4A',
    extension: 'm4a',
    mimeType: 'audio/mp4',
    speed: 'Мгновенно',
    quality: 'Без потерь',
    hint: 'Дорожка копируется из видео как есть, без единого пересчёта.',
    lossless: true,
  },
  {
    id: 'wav',
    title: 'WAV',
    extension: 'wav',
    mimeType: 'audio/wav',
    speed: 'Быстро',
    quality: 'Без потерь, файл крупный',
    hint: 'Несжатый звук: для монтажа и расшифровки.',
    lossless: true,
  },
  {
    id: 'mp3',
    title: 'MP3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    speed: 'Медленнее',
    quality: 'Повторное сжатие',
    hint: 'Открывается везде. Звук пережимается ещё раз.',
    lossless: false,
    defaultBitrateKbps: 192,
  },
] as const;

export const DEFAULT_FORMAT: FormatId = 'm4a';

export function findFormat(id: FormatId): FormatDescriptor | undefined {
  return FORMATS.find((format) => format.id === id);
}
