import { apiUrl } from '../../../shared/api/client';

export type RankingServiceKey =
  | 'fortune_total'
  | 'ask_chat'
  | 'reward_gacha'
  | 'scratch_lottery'
  | 'reward_quiz'
  | 'idiom_quiz'
  | 'crossword'
  | 'roulette'
  | 'lotto';

export type RankingPeriod = 'daily' | 'weekly' | 'monthly';

export interface ServiceRankingEntry {
  userKey: string;
  nickname: string;
  rank: number;
  score: number;
  playCount?: number;
  bestScore?: number;
  pointsEarned?: number;
  streakDays?: number;
  isMe?: boolean;
}

export interface ServiceRankingData {
  serviceKey: RankingServiceKey;
  period: RankingPeriod;
  entries: ServiceRankingEntry[];
  myRank?: ServiceRankingEntry | null;
  updatedAt?: string;
  emptyState?: {
    title?: string;
    description?: string;
  };
}

interface FetchServiceRankingParams {
  serviceKey: RankingServiceKey;
  period: RankingPeriod;
  userKey?: string;
  limit?: number;
}

const normalizeEntry = (entry: any, index: number): ServiceRankingEntry => ({
  userKey: String(entry?.userKey ?? entry?.id ?? `rank_${index + 1}`),
  nickname: String(entry?.nickname ?? entry?.name ?? entry?.userName ?? '가차 손님'),
  rank: Number(entry?.rank ?? index + 1),
  score: Number(entry?.score ?? entry?.bestScore ?? entry?.pointsEarned ?? 0),
  playCount: entry?.playCount === undefined ? entry?.count : Number(entry.playCount),
  bestScore: entry?.bestScore === undefined ? undefined : Number(entry.bestScore),
  pointsEarned: entry?.pointsEarned === undefined ? entry?.rewardScore : Number(entry.pointsEarned),
  streakDays: entry?.streakDays === undefined ? undefined : Number(entry.streakDays),
  isMe: Boolean(entry?.isMe),
});

const parseRankingPayload = (
  payload: any,
  serviceKey: RankingServiceKey,
  period: RankingPeriod
): ServiceRankingData => {
  const data = payload?.data || payload?.success || payload || {};
  const rows = data.rankings || data.entries || data.items || [];
  const entries = Array.isArray(rows) ? rows.map(normalizeEntry) : [];
  const myRank = data.myRank || data.me || null;

  return {
    serviceKey: data.serviceKey || serviceKey,
    period: data.period || period,
    entries,
    myRank: myRank ? normalizeEntry(myRank, entries.length) : null,
    updatedAt: data.updatedAt || payload?.updatedAt,
    emptyState: data.emptyState || null,
  };
};

export const fetchServiceRanking = async ({
  serviceKey,
  period,
  userKey,
  limit = 20,
}: FetchServiceRankingParams): Promise<ServiceRankingData> => {
  const urls = [
    apiUrl(`/rankings/services/${encodeURIComponent(serviceKey)}`, {
      query: { period, limit, userKey },
    }),
    apiUrl(`/ranking/${period}`, {
      query: { serviceKey, limit, userKey },
    }),
  ];

  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        lastError = new Error(`Ranking API ${response.status}`);
        continue;
      }
      const payload = await response.json();
      return parseRankingPayload(payload, serviceKey, period);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Ranking API failed');
};
