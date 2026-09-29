import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { apiUrl } from '../../../shared/api/client';
import { Card, ErrorState, PageHeader, Skeleton } from '../../../shared/components/ui';

interface SettingsPageProps {
  onBack: () => void;
  userKey: string;
  onAlert?: (config: { title: string; description: string }) => void;
}

interface NotificationItem {
  key: string;
  title: string;
  description: string;
  enabled: boolean;
}

const DEFAULT_NOTIFICATIONS: NotificationItem[] = [
  { key: 'attendance', title: '3일 연속 출석', description: '3일 연속 접속하면 포인트를 받아요', enabled: true },
  { key: 'advice', title: '조언 5회 뽑기', description: '조언 5회 이상 뽑으면 10점을 받아요', enabled: true },
  { key: 'morning', title: '오전 운세', description: '하루의 시작을 여는 운세를 알려드려요', enabled: true },
  { key: 'evening', title: '오후 운세', description: '하루를 마무리하는 운세를 알려드려요', enabled: true },
];

const SettingsSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 4 }).map((_, index) => (
      <Card key={index} surface="reading" className="flex items-center gap-4 px-4 py-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-4/5" />
        </div>
        <Skeleton className="h-8 w-14 rounded-full" />
      </Card>
    ))}
  </div>
);

export const SettingsPage = ({ onBack, userKey, onAlert }: SettingsPageProps) => {
  useAppNavigationBar({ title: '알림 설정', showBack: true, onBackPress: onBack });

  const [settingsList, setSettingsList] = useState<NotificationItem[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);

    if (!userKey || userKey.startsWith('mock_')) {
      setSettingsList(DEFAULT_NOTIFICATIONS);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(apiUrl('/user/settings', { query: { userKey } }));
      if (!res.ok) throw new Error(`settings ${res.status}`);
      const json = await res.json();
      const data = json.data;

      if (typeof data?.notificationsEnabled === 'boolean') {
        setNotificationsEnabled(data.notificationsEnabled);
      } else if (typeof data?.marketing === 'boolean') {
        setNotificationsEnabled(data.marketing);
      }

      if (Array.isArray(data?.notifications)) {
        setSettingsList(data.notifications);
      } else if (data?.notifications && typeof data.notifications === 'object') {
        setSettingsList(DEFAULT_NOTIFICATIONS.map((item) => ({
          ...item,
          enabled: data.notifications[item.key] ?? item.enabled,
        })));
      } else {
        setSettingsList(DEFAULT_NOTIFICATIONS);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      setSettingsList([]);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [userKey]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSettings = useCallback(async (newEnabled: boolean, newList: NotificationItem[]) => {
    if (!userKey || userKey.startsWith('mock_')) return;

    const notifications = newList.reduce<Record<string, boolean>>((acc, item) => {
      acc[item.key] = item.enabled;
      return acc;
    }, {});

    const response = await fetch(apiUrl('/user/settings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userKey,
        notificationsEnabled: newEnabled,
        notifications,
      }),
    });

    if (!response.ok) throw new Error(`settings save ${response.status}`);
  }, [userKey]);

  const reportSaveError = () => {
    onAlert?.({
      title: '저장 실패',
      description: '알림 설정을 저장하지 못했어요. 다시 시도해 주세요.',
    });
  };

  const handleMasterToggle = async () => {
    if (isSaving) return;
    const previous = notificationsEnabled;
    const next = !previous;
    setNotificationsEnabled(next);
    setIsSaving(true);
    try {
      await saveSettings(next, settingsList);
    } catch (error) {
      console.error('Failed to save notification setting:', error);
      setNotificationsEnabled(previous);
      reportSaveError();
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (key: string) => {
    if (isSaving) return;
    const previous = settingsList;
    const next = settingsList.map((item) =>
      item.key === key ? { ...item, enabled: !item.enabled } : item
    );
    setSettingsList(next);
    setIsSaving(true);
    try {
      await saveSettings(notificationsEnabled, next);
    } catch (error) {
      console.error('Failed to save notification item:', error);
      setSettingsList(previous);
      reportSaveError();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="-mx-5 -mt-10 min-h-[100dvh] surface-reading px-5 pt-14 pb-12"
    >
      <PageHeader title="알림 설정" onBack={onBack} />

      <Card surface="reading" className="mt-5 px-5 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-toss-blue/10 text-toss-blue">
            <Bell size={20} aria-hidden="true" />
          </div>
          <div>
            <h1 className="t-section text-toss-gray-900">필요한 알림만 받을 수 있어요</h1>
            <p className="t-body mt-1 text-toss-gray-500">운세, 출석, 혜택 알림을 한곳에서 관리해요.</p>
          </div>
        </div>
      </Card>

      <section className="mt-5 space-y-3">
        {isLoading ? (
          <SettingsSkeleton />
        ) : loadError ? (
          <ErrorState message="알림 설정을 불러오지 못했어요" onRetry={loadSettings} />
        ) : (
          <>
            <SettingItem
              title="푸시 알림 받기"
              desc="이벤트와 혜택 소식을 알림으로 받을 수 있어요"
              isOn={notificationsEnabled}
              onToggle={handleMasterToggle}
              disabled={isSaving}
              isMaster
            />
            {notificationsEnabled && settingsList.map((item) => (
              <SettingItem
                key={item.key}
                title={item.title}
                desc={item.description}
                isOn={item.enabled}
                onToggle={() => void handleToggle(item.key)}
                disabled={isSaving}
              />
            ))}
          </>
        )}
      </section>
    </motion.div>
  );
};

interface SettingItemProps {
  title: string;
  desc: string;
  isOn: boolean;
  onToggle: () => void;
  disabled?: boolean;
  isMaster?: boolean;
}

const SettingItem = ({ title, desc, isOn, onToggle, disabled = false, isMaster = false }: SettingItemProps) => (
  <Card surface={isMaster ? 'play' : 'reading'} className="flex items-center justify-between gap-4 px-4 py-4">
    <div className="min-w-0 flex-1">
      <h2 className={isMaster ? 't-section text-toss-gray-900' : 't-body font-bold text-toss-gray-900'}>
        {title}
      </h2>
      <p className="t-caption mt-1 break-keep text-toss-gray-500">{desc}</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={`${title} ${isOn ? '끄기' : '켜기'}`}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-11 w-16 shrink-0 rounded-full border-2 border-ink transition-colors disabled:opacity-50 ${
        isOn ? 'bg-toss-blue' : 'bg-toss-gray-200'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 h-8 w-8 rounded-full bg-paper shadow-hard-sm transition-transform ${
          isOn ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </Card>
);
