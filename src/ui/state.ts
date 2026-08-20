import { DEFAULT_FORMAT } from '../formats';
import type { ConvertResult, FormatId, SharedSource } from '../media';

/**
 * Экран один, поэтому и состояние одно: конечный автомат на useReducer.
 * State-менеджер сюда не нужен.
 */

export type ScreenState =
  | { kind: 'unavailable' }
  | { kind: 'empty' }
  | { kind: 'ready'; source: SharedSource; format: FormatId }
  | { kind: 'working'; source: SharedSource; format: FormatId; progress?: number; cancelling: boolean }
  | { kind: 'done'; source: SharedSource; format: FormatId; result: ConvertResult }
  | { kind: 'error'; source?: SharedSource; format: FormatId; message: string };

export type Action =
  | { type: 'module-unavailable' }
  | { type: 'source-received'; source: SharedSource }
  | { type: 'source-cleared' }
  | { type: 'format-selected'; format: FormatId }
  | { type: 'started' }
  | { type: 'progressed'; progress: number }
  | { type: 'cancel-requested' }
  | { type: 'succeeded'; result: ConvertResult }
  | { type: 'failed'; message: string }
  | { type: 'reset-to-source' };

export const initialState: ScreenState = { kind: 'empty' };

/** Текущий выбор формата переживает смену состояний: человек выбрал — помним. */
function formatOf(state: ScreenState): FormatId {
  return 'format' in state ? state.format : DEFAULT_FORMAT;
}

function sourceOf(state: ScreenState): SharedSource | undefined {
  return 'source' in state ? state.source : undefined;
}

export function reducer(state: ScreenState, action: Action): ScreenState {
  switch (action.type) {
    case 'module-unavailable':
      return { kind: 'unavailable' };

    case 'source-received':
      return { kind: 'ready', source: action.source, format: formatOf(state) };

    case 'source-cleared':
      return { kind: 'empty' };

    case 'format-selected': {
      const source = sourceOf(state);
      if (!source || state.kind === 'working') {
        return state;
      }
      return { kind: 'ready', source, format: action.format };
    }

    case 'started': {
      const source = sourceOf(state);
      if (!source) {
        return state;
      }
      return { kind: 'working', source, format: formatOf(state), cancelling: false };
    }

    case 'progressed':
      return state.kind === 'working' ? { ...state, progress: action.progress } : state;

    case 'cancel-requested':
      return state.kind === 'working' ? { ...state, cancelling: true } : state;

    case 'succeeded': {
      const source = sourceOf(state);
      if (!source) {
        return state;
      }
      return { kind: 'done', source, format: formatOf(state), result: action.result };
    }

    case 'failed':
      return {
        kind: 'error',
        source: sourceOf(state),
        format: formatOf(state),
        message: action.message,
      };

    case 'reset-to-source': {
      const source = sourceOf(state);
      return source
        ? { kind: 'ready', source, format: formatOf(state) }
        : { kind: 'empty' };
    }

    default:
      return state;
  }
}
