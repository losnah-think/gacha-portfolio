export const formatRelativeTime = (timestamp: number) => {
  const time = Number(timestamp);
  if (!Number.isFinite(time) || time <= 0) return '방금 전';

  const diffMs = Date.now() - time;
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffHours < 48) return '어제';

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) return `${diffDays}일 전`;

  const date = new Date(time);
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(date);
};
