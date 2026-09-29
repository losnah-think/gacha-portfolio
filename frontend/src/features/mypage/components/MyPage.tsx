import { motion } from 'framer-motion';
import { memo, useCallback, useState, useMemo, useEffect } from 'react';
import { Edit2, Check, X, Bell, CalendarDays, Flame, ChevronLeft, ChevronRight, LogOut, Settings, UserX } from 'lucide-react';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { logClick, logAccountDeleteStart, logAccountDeleteConfirm, logLogout } from '../../../utils/analytics';
import { apiUrl } from '../../../shared/api/client';
import { Button, Card, ErrorState, Skeleton, useModal } from '../../../shared/components/ui';

interface MyPageProps {
  userKey: string;
  userInfo?: {
    name: string;
    gender: string | null;
    birthday: string | null;
    ageGroup: number | null;
  };
  onUpdateName?: (newName: string) => void;
  consecutiveDays?: number;
  onBack: () => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const DeleteAccountConfirm = ({
  onDeleteAccount,
  userKey,
}: {
  onDeleteAccount?: () => void;
  userKey: string;
}) => {
  const { closeModal } = useModal();
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const canDelete = deleteConfirmText === '탈퇴합니다' && !isDeleting;

  return (
    <div className="text-left">
      <div className="rounded-lg bg-toss-red/5 p-4">
        <p className="t-caption font-bold text-danger">탈퇴 시 아래 데이터가 모두 삭제됩니다.</p>
        <ul className="t-caption mt-2 space-y-1 text-toss-gray-600">
          <li>보유 포인트 및 이용권</li>
          <li>뽑기 기록 및 상담 이력</li>
          <li>출석 기록 및 랭킹 정보</li>
          <li>캐릭터 레벨 및 경험치</li>
        </ul>
        <p className="t-micro mt-3 text-danger">이 작업은 되돌릴 수 없어요.</p>
      </div>
      <label className="t-caption mt-4 block text-center text-toss-gray-500">
        확인을 위해 &quot;탈퇴합니다&quot;를 입력해 주세요
        <input
          type="text"
          value={deleteConfirmText}
          onChange={(event) => setDeleteConfirmText(event.target.value)}
          className="t-body mt-2 w-full rounded-md border border-toss-gray-200 bg-paper px-3 py-3 text-center font-bold text-toss-gray-900 outline-none focus:border-danger"
          placeholder="탈퇴합니다"
        />
      </label>
      <div className="mt-5 flex gap-2">
        <Button variant="secondary" onClick={closeModal}>
          취소
        </Button>
        <Button
          disabled={!canDelete}
          className="border-danger bg-danger text-white shadow-hard active:shadow-none disabled:border-toss-gray-200 disabled:bg-toss-gray-100 disabled:text-toss-gray-300"
          onClick={async () => {
            if (!canDelete) return;
            logAccountDeleteConfirm(userKey);
            setIsDeleting(true);
            try {
              if (userKey && !userKey.startsWith('mock_')) {
                await fetch(apiUrl('/user/delete'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userKey }),
                });
              }
            } catch (error) {
              console.error('Account deletion API failed:', error);
            } finally {
              setIsDeleting(false);
              closeModal();
              onDeleteAccount?.();
            }
          }}
        >
          {isDeleting ? '처리중...' : '탈퇴하기'}
        </Button>
      </div>
    </div>
  );
};

export const MyPage = memo(({
  userKey,
  userInfo,
  onUpdateName,
  consecutiveDays = 0,
  onBack,
  onOpenSettings,
  onLogout,
  onDeleteAccount,
}: MyPageProps) => {
  /* 마이페이지 상태 */
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [attendanceDates, setAttendanceDates] = useState<Set<string>>(new Set());
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [attendanceFeedback, setAttendanceFeedback] = useState<string | null>(null);
  const [localConsecutiveDays, setLocalConsecutiveDays] = useState(consecutiveDays);
  const { showConfirm, showModal } = useModal();

  useAppNavigationBar({ title: '마이페이지', onBackPress: onBack });

  useEffect(() => {
    setLocalConsecutiveDays(consecutiveDays);
  }, [consecutiveDays]);

  const openLogoutConfirm = useCallback(() => {
    showConfirm({
      title: '로그아웃할까요?',
      description: '다시 로그인하면 기록을 이어갈 수 있어요.',
      confirmText: '로그아웃',
      cancelText: '취소',
      isDestructive: true,
      onConfirm: () => {
        logLogout();
        onLogout?.();
      },
    });
  }, [onLogout, showConfirm]);

  const openDeleteConfirm = useCallback(() => {
    logAccountDeleteStart();
    showModal({
      title: '정말 탈퇴할까요?',
      description: '탈퇴 전에 삭제되는 데이터를 확인해 주세요.',
      children: <DeleteAccountConfirm userKey={userKey} onDeleteAccount={onDeleteAccount} />,
      actions: [],
    });
  }, [onDeleteAccount, showModal, userKey]);

  /* 출석 기록 로드 */
  useEffect(() => {
    if (!userKey) return;
    if (userKey.startsWith('mock_')) {
      setAttendanceDates(new Set());
      setAttendanceError(null);
      return;
    }
    (async () => {
      setIsAttendanceLoading(true);
      setAttendanceError(null);
      try {
        const { year, month } = calendarMonth;
        const res = await fetch(apiUrl('/attendance/history', { query: { userKey, year, month: month + 1 } }));
        if (!res.ok) throw new Error(`attendance ${res.status}`);
        const json = await res.json();
        const data = json.data;
        if (Array.isArray(data?.dates)) {
          setAttendanceDates(new Set(data.dates.map((d: string) => d.slice(0, 10))));
        } else if (Array.isArray(data)) {
          setAttendanceDates(new Set(data.map((d: string) => d.slice(0, 10))));
        } else {
          setAttendanceDates(new Set());
        }
      } catch (e) {
        console.error('Attendance fetch failed:', e);
        setAttendanceDates(new Set());
        setAttendanceError('출석 기록을 불러오지 못했어요');
      } finally {
        setIsAttendanceLoading(false);
      }
    })();
  }, [userKey, calendarMonth]);

  /* 캘린더 헬퍼 */
  const calendarDays = useMemo(() => {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [calendarMonth]);

  const goMonth = (delta: number) => {
    setCalendarMonth(prev => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
      return { year: y, month: m };
    });
  };

  const isToday = (day: number) => {
    const now = new Date();
    return calendarMonth.year === now.getFullYear() && calendarMonth.month === now.getMonth() && day === now.getDate();
  };

  const isAttended = (day: number) => {
    const { year, month } = calendarMonth;
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return attendanceDates.has(key);
  };

  /* 출석 날짜 마킹 */
  const handleMarkAttendance = useCallback(async (day: number) => {
    const { year, month } = calendarMonth;
    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    if (!isCurrentMonth || day !== now.getDate()) return;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (attendanceDates.has(dateStr)) return;
    if (!userKey || userKey.startsWith('mock_')) return;
    setAttendanceDates(prev => new Set([...prev, dateStr]));
    try {
      const res = await fetch(apiUrl('/user/attendance'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey }),
      });
      if (res.ok) {
        const json = await res.json();
        const data = json.data || json;
        if (data.alreadyChecked) return;
        if (typeof data.consecutiveDays === 'number') {
          setLocalConsecutiveDays(data.consecutiveDays);
        }
        const rewardPoints = Number(data.rewardPoints ?? data.pointsAwarded ?? data.points ?? 0);
        setAttendanceFeedback(rewardPoints > 0 ? `출석 완료 · ${rewardPoints.toLocaleString()}점 적립` : '출석을 기록했어요');
      } else {
        throw new Error('attendance failed');
      }
    } catch (e) {
      console.error('Attendance mark failed:', e);
      setAttendanceDates(prev => { const next = new Set(prev); next.delete(dateStr); return next; });
    }
  }, [calendarMonth, attendanceDates, userKey]);

  /* 푸시 설정 로드 */
  useEffect(() => {
    if (!userKey || userKey.startsWith('mock_')) return;
    (async () => {
      setIsPushLoading(true);
      try {
        const res = await fetch(apiUrl('/user/settings', { query: { userKey } }));
        if (res.ok) {
          const json = await res.json();
          const data = json.data;
          if (data) {
            if (typeof data.notificationsEnabled === 'boolean') setPushEnabled(data.notificationsEnabled);
            else if (typeof data.marketing === 'boolean') setPushEnabled(data.marketing);
          }
        }
      } catch (e) { console.error('Push settings load failed:', e); }
      finally { setIsPushLoading(false); }
    })();
  }, [userKey]);

  const handlePushToggle = useCallback(async () => {
    const next = !pushEnabled;
    setPushError(null);
    setPushEnabled(next);
    if (!userKey || userKey.startsWith('mock_')) return;
    setIsPushLoading(true);
    try {
      const res = await fetch(apiUrl('/user/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey, notificationsEnabled: next }),
      });
      if (!res.ok) throw new Error(`push ${res.status}`);
    } catch (e) {
      console.error('Push settings save failed:', e);
      setPushEnabled(!next);
      setPushError('알림 설정을 저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setIsPushLoading(false);
    }
  }, [pushEnabled, userKey]);

  /* 닉네임 편집 */
  const handleUpdateNickname = useCallback(async () => {
    if (!newName.trim() || !onUpdateName) return;
    if (newName === userInfo?.name) { setIsEditingName(false); return; }
    setIsSavingName(true);
    setNicknameError(null);
    try {
      const res = await fetch(apiUrl('/profile/nickname', { version: 'v3' }), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey, nickname: newName.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.resultType === 'SUCCESS') { onUpdateName(newName.trim()); setIsEditingName(false); return; }
      }
      setNicknameError('닉네임을 저장하지 못했어요. 다시 시도해 주세요');
    } catch (e) {
      console.error(e);
      setNicknameError('닉네임을 저장하지 못했어요. 다시 시도해 주세요');
    }
    finally { setIsSavingName(false); }
  }, [newName, userInfo?.name, onUpdateName, userKey]);

  const startEditing = () => { setNewName(userInfo?.name || ''); setNicknameError(null); setIsEditingName(true); };
  const cancelEditing = () => { setIsEditingName(false); setNewName(''); setNicknameError(null); };

  const formatBirthday = (birthday: string | null) => {
    if (!birthday) return '-';
    if (birthday.length === 8) {
      const m = parseInt(birthday.slice(4, 6), 10);
      const d = parseInt(birthday.slice(6, 8), 10);
      return `${m}월 ${d}일`;
    }
    if (birthday.length === 4) return `${parseInt(birthday.slice(0, 2), 10)}월 ${parseInt(birthday.slice(2, 4), 10)}일`;
    return birthday;
  };
  const formatGender = (gender: string | null) => {
    if (!gender) return '-';
    if (['male','MALE','남','M'].includes(gender)) return '남성';
    if (['female','FEMALE','여','F'].includes(gender)) return '여성';
    return gender;
  };

  return (
    <motion.div
      key="mypage"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6 relative overflow-x-hidden z-0"
    >
      {/* ── Header ── */}
      <div className="space-y-1.5">
        <h2 className="text-[26px] font-bold text-toss-gray-900 leading-[1.2] tracking-tight">
          마이페이지
        </h2>
        <p className="text-[15px] text-toss-gray-400 font-medium">나의 정보와 출석, 설정을 한눈에</p>
      </div>

      {/* 프로필 */}
      <Card surface="reading" className="space-y-5 p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-toss-blue/15 to-purple-100/40 flex items-center justify-center text-[22px] font-black text-toss-blue">
            {(userInfo?.name || '?')[0]}
          </div>
          <div className="flex-1 min-w-0">
            {!isEditingName ? (
              <div className="flex items-center gap-2">
                <h3 className="text-[20px] font-bold text-toss-gray-900 truncate">{userInfo?.name || '방문자'}님</h3>
                <button
                  type="button"
                  aria-label="닉네임 편집"
                  onClick={startEditing}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-toss-gray-400 transition-colors hover:bg-toss-gray-100"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="text-[18px] font-bold text-toss-gray-900 border-b-2 border-toss-blue focus:outline-none bg-transparent w-full max-w-[160px]"
                  placeholder="닉네임 입력"
                  maxLength={10}
                  autoFocus
                />
                <button
                  type="button"
                  aria-label="닉네임 저장"
                  onClick={handleUpdateNickname}
                  disabled={isSavingName}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md bg-toss-blue text-white transition-colors disabled:bg-toss-gray-300"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  aria-label="닉네임 편집 취소"
                  onClick={cancelEditing}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md bg-toss-gray-200 text-toss-gray-500 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {nicknameError && (
              <p className="t-caption mt-2 font-bold text-danger" role="alert">
                {nicknameError}
              </p>
            )}
            <p className="text-[13px] text-toss-gray-400 font-medium mt-0.5">
              {userKey && !userKey.startsWith('mock_') ? '안전하게 보호되는 내 정보' : '토스 로그인으로 더 많은 기능을 이용해 보세요'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3.5 rounded-2xl bg-toss-gray-50 flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-toss-gray-400">성별</span>
            <span className="text-[15px] font-bold text-toss-gray-800">{formatGender(userInfo?.gender || null)}</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-toss-gray-50 flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-toss-gray-400">생년월일</span>
            <span className="text-[15px] font-bold text-toss-gray-800">{formatBirthday(userInfo?.birthday || null)}</span>
          </div>
        </div>
      </Card>

      {/* 출석 캘린더 */}
      <Card surface="reading" className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-toss-blue" />
            <h3 className="text-[15px] font-bold text-toss-gray-900">출석 캘린더</h3>
          </div>
          {localConsecutiveDays > 0 && (
            <div className="flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1">
              <Flame size={11} className="fill-current text-warning" />
              <span className="t-micro font-extrabold text-warning">{localConsecutiveDays}일 연속</span>
            </div>
          )}
        </div>

        {/* 월 네비게이션 */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => goMonth(-1)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-toss-gray-400 transition-colors hover:bg-toss-gray-50"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-[15px] font-bold text-toss-gray-800">
            {calendarMonth.year}년 {calendarMonth.month + 1}월
          </span>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => goMonth(1)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-toss-gray-400 transition-colors hover:bg-toss-gray-50"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`text-center text-[11px] font-bold py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-toss-blue' : 'text-toss-gray-400'}`}>
              {w}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        {isAttendanceLoading ? (
          <div className="grid grid-cols-7 gap-1" aria-label="출석 기록을 불러오는 중">
            {Array.from({ length: 35 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square rounded-md" />
            ))}
          </div>
        ) : attendanceError ? (
          <ErrorState
            className="py-6"
            message={attendanceError}
            onRetry={() => setCalendarMonth((prev) => ({ ...prev }))}
          />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} className="aspect-square" />;
              const attended = isAttended(day);
              const today = isToday(day);
              const isMarkable = today && !attended;
              return (
                <button
                  key={day}
                  onClick={() => handleMarkAttendance(day)}
                  disabled={!isMarkable}
                  className={`aspect-square rounded-xl flex items-center justify-center text-[13px] font-bold transition-all ${
                    attended
                      ? 'bg-toss-blue text-white shadow-sm shadow-toss-blue/20'
                      : today
                        ? 'bg-toss-blue/[0.08] text-toss-blue ring-1 ring-toss-blue/20 active:scale-95'
                        : 'text-toss-gray-500'
                  }`}
                >
                  {attended ? (
                    <div className="flex flex-col items-center gap-0">
                      <Check size={12} strokeWidth={3} />
                      <span className="t-micro leading-none">{day}</span>
                    </div>
                  ) : (
                    day
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* 안내 */}
        {attendanceFeedback && (
          <p className="t-caption rounded-md bg-toss-blue/10 px-3 py-2 text-center font-bold text-toss-blue" role="status">
            {attendanceFeedback}
          </p>
        )}
        <p className="text-[11px] text-toss-gray-400 font-medium text-center pt-1">
          오늘 날짜를 눌러 출석을 기록해 보세요
        </p>
      </Card>

      {/* 푸시 알림 */}
      <Card surface="reading" className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-toss-blue/[0.08] flex items-center justify-center">
              <Bell size={18} className="text-toss-blue" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-toss-gray-900">푸시 알림</h3>
              <p className="text-[12px] text-toss-gray-400 font-medium mt-0.5">이벤트와 혜택 소식을 받아보세요</p>
            </div>
          </div>
          {isPushLoading ? (
            <Skeleton className="h-8 w-14 rounded-full" />
          ) : (
            <button
              type="button"
              role="switch"
              aria-checked={pushEnabled}
              aria-label={`푸시 알림 ${pushEnabled ? '끄기' : '켜기'}`}
              onClick={handlePushToggle}
              disabled={isPushLoading}
              className={`relative h-11 w-16 shrink-0 rounded-full transition-all duration-200 ${pushEnabled ? 'bg-toss-blue' : 'bg-toss-gray-200'}`}
            >
              <div className={`absolute left-1 top-1 h-9 w-9 rounded-full bg-white shadow-sm transition-transform duration-200 ${pushEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          )}
        </div>
        {pushError && (
          <p className="t-caption mt-3 font-bold text-danger" role="alert">
            {pushError}
          </p>
        )}
      </Card>

      {/* 목록 그룹 */}
      <Card surface="reading" className="divide-y divide-toss-gray-100 overflow-hidden">
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-4 text-left"
          >
            <span className="flex items-center gap-3">
              <Settings size={18} className="text-toss-gray-500" aria-hidden="true" />
              <span className="t-body font-bold text-toss-gray-800">알림 설정</span>
            </span>
            <ChevronRight size={18} className="text-toss-gray-300" aria-hidden="true" />
          </button>
        )}
        <div className="px-4 py-3.5">
          <p className="text-center t-caption font-bold text-toss-gray-400">
            오늘의 이야기 · 참고용으로 확인해요
          </p>
        </div>
      </Card>

      {/* 로그아웃 & 회원 탈퇴 */}
      <div className="space-y-2.5">
        {onLogout && (
          <button
            onClick={() => {
              logClick('mypage_logout_button');
              openLogoutConfirm();
            }}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-white border border-toss-gray-100 shadow-sm active:scale-[0.98] transition-transform"
          >
            <LogOut size={16} className="text-toss-gray-400" />
            <span className="text-[15px] font-bold text-toss-gray-500">로그아웃</span>
          </button>
        )}
        {onDeleteAccount && (
          <button
            onClick={openDeleteConfirm}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-red-100/60 active:scale-[0.98] transition-transform"
          >
            <UserX size={15} className="text-red-300" />
            <span className="text-[14px] font-bold text-red-400">회원 탈퇴</span>
          </button>
        )}
      </div>

    </motion.div>
  );
});
