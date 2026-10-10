const unsupported = Object.assign((): never => {
  throw new Error('이 기능은 토스 앱에서만 사용할 수 있어요.');
}, { isSupported: () => false });

const addEventListener = () => () => {};

export const appLogin = unsupported;
export const share = unsupported;
export const getTossShareLink = unsupported;
export const closeView = unsupported;
export const contactsViral = unsupported;
export const loadFullScreenAd = unsupported;
export const showFullScreenAd = unsupported;
export const IAP = {
  getPendingOrders: unsupported,
  completeProductGrant: unsupported,
};
export const TossAds = { initialize: unsupported, attachBanner: unsupported };
export const getCurrentLocation = Object.assign(unsupported, {
  getPermission: unsupported,
  openPermissionDialog: unsupported,
});
export const graniteEvent = { addEventListener };
export const tdsEvent = { addEventListener };
export const partner = { addAccessoryButton: () => {} };
export const generateHapticFeedback = () => {};
export const Analytics = { click: () => {}, impression: () => {} };
