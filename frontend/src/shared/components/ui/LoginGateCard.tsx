import { LogIn, Sparkles, Ticket, Trophy } from 'lucide-react';
import { AppImage } from './AppImage';
import { Button } from './Button';
import { Card } from './Card';

interface LoginGateCardProps {
  title: string;
  description: string;
  onLogin: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const friendlyLoginError = (error?: string | null) => {
  if (!error) return null;
  if (/network|fetch|인터넷|네트워크/i.test(error)) {
    return '네트워크가 잠시 불안정해요. 다시 시도해 주세요.';
  }
  return '로그인이 잠시 안 됐어요. 다시 시도해 주세요.';
};

const BENEFITS = [
  { icon: Ticket, text: '매일 무료 이용권을 받아요' },
  { icon: Sparkles, text: '게임하면 포인트가 쌓여요' },
  { icon: Trophy, text: '포인트는 이용권으로 바꿔요' },
];

export const LoginGateCard = ({
  description,
  error,
  isLoading = false,
  onLogin,
  title,
}: LoginGateCardProps) => {
  const message = friendlyLoginError(error);

  return (
    <Card surface="play" className="mx-auto mt-8 max-w-md px-6 py-7 text-center">
      <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-lg border-2 border-ink bg-paper shadow-hard-sm">
        <AppImage
          src="/images/reward-mascot.png"
          alt=""
          width={112}
          className="h-24 w-24 object-contain"
        />
      </div>
      <h3 className="t-title mt-5 text-toss-gray-900">{title}</h3>
      <p className="t-body mt-2 break-keep text-toss-gray-600">{description}</p>
      <div className="mt-5 space-y-2 text-left">
        {BENEFITS.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3 rounded-md border border-toss-gray-100 bg-paper px-3 py-2.5">
            <Icon size={18} className="shrink-0 text-toss-blue" aria-hidden="true" />
            <span className="t-caption font-bold text-toss-gray-700">{text}</span>
          </div>
        ))}
      </div>
      <Button className="mt-6" onClick={onLogin} loading={isLoading}>
        <LogIn size={18} aria-hidden="true" />
        토스로 3초 만에 시작하기
      </Button>
      {message && (
        <p className="t-caption mt-3 font-bold text-danger" role="alert">
          {message}
        </p>
      )}
    </Card>
  );
};
