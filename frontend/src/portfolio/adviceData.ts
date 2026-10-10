import { PERSONAS } from '../shared/constants/personas';
import type { ResultHistoryItem } from '../shared/types';

export const ADVICE_STORAGE_KEY = 'gacha_portfolio_ai_results_v1';
export const ADVICE_PERSONAS = PERSONAS.filter((persona) =>
  ['socrates', 'cat', 'healing_단골_카페_사장님'].includes(persona.id),
);

export interface AdviceResult extends ResultHistoryItem {
  source: 'vertex';
  model: string;
  personaName: string;
  situation: string;
}

function isAdviceResult(item: unknown): item is AdviceResult {
  if (!item || typeof item !== 'object') return false;
  const value = item as Record<string, unknown>;
  return value.source === 'vertex' &&
    ['id', 'title', 'summary', 'situation', 'personaName', 'content', 'model'].every((key) =>
      typeof value[key] === 'string' && value[key].length > 0 && value[key].length <= 2000,
    ) && typeof value.timestamp === 'number' && Number.isFinite(value.timestamp) &&
    typeof value.content === 'string' && value.content.length <= 250 && /[가-힣]/.test(value.content);
}

export async function requestAdvice(personaId: string, input: string): Promise<AdviceResult> {
  const situation = input.trim();
  if (!ADVICE_PERSONAS.some((item) => item.id === personaId) || !situation || situation.length > 200) throw new Error('캐릭터를 선택하고 고민을 1~200자로 적어 주세요.');
  const response = await fetch('/api/advice', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personaId, situation }), signal: AbortSignal.timeout(30_000),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = data && typeof data === 'object' && 'error' in data ? data.error : null;
    throw new Error(typeof error === 'string' && error.length <= 200 ? error : '조언을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (!isAdviceResult(data)) throw new Error('완성된 조언을 받지 못했습니다. 다시 시도해 주세요.');
  return data;
}

export function readAdviceHistory(): AdviceResult[] {
  const raw = localStorage.getItem(ADVICE_STORAGE_KEY);
  if (!raw) return [];
  const items: unknown = JSON.parse(raw);
  if (!Array.isArray(items) || items.length > 10 || !items.every(isAdviceResult)) throw new Error('저장된 조언을 읽을 수 없습니다.');
  return items.map(({ id, title, summary, situation, personaName, content, timestamp, model }) => ({
    id, title, summary, situation, personaName, content, timestamp, model, type: 'quote', source: 'vertex',
  }));
}
