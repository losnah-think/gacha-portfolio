import { generateHapticFeedback } from '@apps-in-toss/web-framework';

export type HapticType =
  | 'tickWeak'
  | 'tap'
  | 'tickMedium'
  | 'softMedium'
  | 'basicWeak'
  | 'basicMedium'
  | 'success'
  | 'error'
  | 'wiggle'
  | 'confetti';

export const haptic = (type: HapticType) => {
  try {
    void generateHapticFeedback({ type });
  } catch {
    // Toss native haptics are unavailable in normal browser/test environments.
  }
};
