import { useEffect, useRef, useMemo } from 'react';
// @apps-in-toss/web-framework v1.7.1 does not export useNavigationBar.
// Using native web APIs and available bridge events instead.
import { graniteEvent, partner, tdsEvent } from '@apps-in-toss/web-framework';
import { useNavAccessory } from '../contexts/NavAccessoryContext';

interface UseAppNavigationBarOptions {
  title?: string;
  showBack?: boolean;
  onBackPress?: () => void;
  /** 우측 액세서리 아이콘 버튼 (1개만 지원). 생략 시 전역 동전 아이콘 자동 적용 */
  accessoryButton?: {
    id: string;
    title: string;
    iconName: string;
    onPress: () => void;
  } | null;
}

export const useAppNavigationBar = ({
  title,
  onBackPress,
  accessoryButton,
}: UseAppNavigationBarOptions = {}) => {
  const nav = useNavAccessory();

  // accessoryButton이 명시적으로 전달되지 않으면 전역 동전 아이콘
  const defaultCoinButton = useMemo(() => {
    if (!nav) return undefined;
    return {
      id: 'points-wallet',
      title: `${nav.userPoints.toLocaleString()}점`,
      iconName: 'icon-coin-mono',
      onPress: nav.goToReward,
    };
  }, [nav]);

  const resolvedButton = accessoryButton !== undefined ? (accessoryButton ?? undefined) : defaultCoinButton;
  const onBackPressRef = useRef(onBackPress);
  const accessoryRef = useRef(resolvedButton);

  useEffect(() => {
    onBackPressRef.current = onBackPress;
  }, [onBackPress]);

  useEffect(() => {
    accessoryRef.current = resolvedButton;
  }, [resolvedButton]);

  // 1. Title Control
  useEffect(() => {
    if (title !== undefined) {
      try {
        document.title = title;
      } catch (_e) {
        // Ignore if document is immutable
      }
    }
  }, [title]);

  // 2. Back Button Event Handling
  useEffect(() => {
    // onBackPress가 없으면 리스너를 등록하지 않음
    if (!onBackPressRef.current) return;

    try {
      const handler = () => {
        if (onBackPressRef.current) {
          onBackPressRef.current();
        }
      };

      const cleanup = graniteEvent.addEventListener('backEvent', {
        onEvent: handler,
      });
      return () => cleanup();
    } catch (_e) {
      // Fallback or ignore if not in native environment
    }
  }, [onBackPress]);

  // 3. Accessory Button (navigation bar icon)
  useEffect(() => {
    if (!resolvedButton) return;

    try {
      if (typeof partner?.addAccessoryButton === 'function') {
        partner.addAccessoryButton({
          id: resolvedButton.id,
          title: resolvedButton.title,
          icon: { name: resolvedButton.iconName },
        });
      }
    } catch (_e) {
      // SDK not available or not in native environment
    }

    try {
      const cleanup = tdsEvent.addEventListener('navigationAccessoryEvent', {
        onEvent: ({ id }: { id: string }) => {
          if (id === accessoryRef.current?.id) {
            accessoryRef.current?.onPress();
          }
        },
      });
      return () => cleanup();
    } catch (_e) {
      // Fallback or ignore
    }
  }, [resolvedButton?.id, resolvedButton?.iconName, resolvedButton?.title]);
};
