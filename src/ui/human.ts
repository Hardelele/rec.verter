/** Подписи для человека: длительность, размер, время. Никаких «числовых помоек». */

export function formatDuration(durationMs?: number): string | undefined {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) {
    return undefined;
  }
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function formatSize(sizeBytes?: number): string | undefined {
  if (sizeBytes === undefined || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return undefined;
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} Б`;
  }
  const units = ['КБ', 'МБ', 'ГБ'];
  let value = sizeBytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** Строка вида «12:04 · 48,3 МБ» — только из того, что действительно известно. */
export function joinFacts(facts: (string | undefined)[]): string {
  return facts.filter((fact): fact is string => Boolean(fact)).join(' · ');
}

/**
 * Куда мост кладёт результат. Папка известна заранее и не зависит от файла,
 * поэтому это подпись, а не разбор пути.
 */
export const RESULT_LOCATION = 'Музыка/rec.verter';
