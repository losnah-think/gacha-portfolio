import { createContext, useContext } from 'react';

interface NavAccessoryContextValue {
  /** 현재 보유 포인트 */
  userPoints: number;
  /** 리워드 탭으로 이동 */
  goToReward: () => void;
}

export const NavAccessoryContext = createContext<NavAccessoryContextValue | null>(null);

export const useNavAccessory = () => useContext(NavAccessoryContext);
