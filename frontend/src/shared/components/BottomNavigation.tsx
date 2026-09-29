import { motion } from 'framer-motion';
import { Archive, Sparkles, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { logTabSwitch } from '../../utils/analytics';
import { SPRING, pressable } from '../motion';
import { cn } from '../utils/cn';
import type { ActiveTab, TabKey } from '../types/navigation';

interface BottomNavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: TabKey) => void;
  logClick: (event: string) => void;
}

const TABS: { key: TabKey; label: string; icon: LucideIcon; event: string }[] = [
  { key: 'home', label: '홈', icon: Sparkles, event: 'tab_home_click' },
  { key: 'ranking', label: '랭킹', icon: Trophy, event: 'tab_ranking_click' },
  { key: 'history', label: '보관함', icon: Archive, event: 'tab_history_click' },
];

export const BottomNavigation = ({ activeTab, setActiveTab, logClick }: BottomNavigationProps) => (
  <nav
    role="tablist"
    aria-label="주요 메뉴"
    className="fixed bottom-[calc(env(safe-area-inset-bottom)+10px)] left-1/2 z-50 flex w-[calc(100%-28px)] max-w-[472px] -translate-x-1/2 items-center gap-1.5 rounded-lg border-2 border-ink bg-cream p-1.5 shadow-hard-sm backdrop-blur-md"
  >
    {TABS.map(({ key, label, icon: Icon, event }) => {
      const isActive = activeTab === key;

      return (
        <motion.button
          key={key}
          type="button"
          role="tab"
          aria-selected={isActive}
          aria-label={label}
          whileTap={pressable.whileTap}
          onClick={() => {
            if (isActive) return;
            logTabSwitch(activeTab, key);
            setActiveTab(key);
            logClick(event);
          }}
          className={cn(
            'relative flex h-14 min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-md',
            isActive ? 'text-white' : 'text-toss-gray-500',
          )}
        >
          {isActive && (
            <motion.span
              layoutId="bottom-tab-active"
              transition={SPRING.snappy}
              className="absolute inset-0 rounded-md bg-toss-blue shadow-hard-sm"
            />
          )}
          <Icon
            size={20}
            strokeWidth={2.6}
            className={cn('relative z-10', isActive ? 'text-white' : 'text-toss-gray-500')}
          />
          <span className={cn('t-caption relative z-10', isActive ? 'text-white' : 'text-toss-gray-600')}>
            {label}
          </span>
        </motion.button>
      );
    })}
  </nav>
);
