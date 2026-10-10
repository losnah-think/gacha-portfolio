import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const provider = vi.hoisted(() => ({
  initializeApp: vi.fn(), getApps: vi.fn(() => []), getAuth: vi.fn(),
  getFirestore: vi.fn(), getAnalytics: vi.fn(),
}));
vi.mock('firebase/app', () => ({ initializeApp: provider.initializeApp, getApps: provider.getApps }));
vi.mock('firebase/auth', () => ({ getAuth: provider.getAuth }));
vi.mock('firebase/firestore', () => ({ getFirestore: provider.getFirestore, doc: vi.fn(), setDoc: vi.fn(), serverTimestamp: vi.fn() }));
vi.mock('firebase/analytics', () => ({ getAnalytics: provider.getAnalytics }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
  vi.stubEnv('VITE_PUBLIC_BROWSER', 'true');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('public browser integration boundary', () => {
  it('does not initialize Firebase auth, Firestore or analytics at startup', async () => {
    const firebase = await import('../../firebase');
    expect(firebase.auth).toBeNull(); expect(firebase.db).toBeNull();
    expect(firebase.analytics).toBeNull(); expect(firebase.analytics2).toBeNull();
    for (const call of Object.values(provider)) expect(call).not.toHaveBeenCalled();
  });

  it('ignores existing Toss storage and never sends, refreshes or clears a native session', async () => {
    localStorage.setItem('toss_access_token', 'pre-existing-test-token');
    localStorage.setItem('toss_user_key', '123');
    const auth = await import('../../toss-auth');
    const readStorage = vi.spyOn(Storage.prototype, 'getItem');
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    expect(await auth.isTossLoggedIn()).toBe(false);
    expect(await auth.ensureFreshToken()).toBe(false);
    expect(await auth.disconnectTossLogin()).toBe(false);
    for (const getter of [auth.getTossSavedUserKey, auth.getTossSavedUserName, auth.getTossSavedUserBirthday, auth.getTossSavedUserGender, auth.getTossSavedUserAgeGroup, auth.getTossSavedAccessToken]) expect(await getter()).toBeNull();
    expect(await auth.getAccessToken('test-code', 'DEFAULT')).toBeNull();
    expect(await auth.getTossUserInfo('test-token')).toBeNull();
    expect(await auth.decryptTossDataWebCrypto('test-data')).toBeNull();
    expect(await auth.refreshAccessToken('test-token')).toBeNull();
    await auth.clearTossSession();
    expect(readStorage).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('toss_access_token')).toBe('pre-existing-test-token');
  });

  it('cannot fall through to development mock login', async () => {
    vi.stubEnv('DEV', true);
    const auth = await import('../../toss-auth');
    await expect(auth.performTossLogin()).rejects.toThrow('토스 앱에서만');
    expect(localStorage.length).toBe(0);
  });

  it('fails closed for native login, purchase, rewards and ads without firing callbacks', async () => {
    const sdk = await import('../tossSdk');
    expect(sdk.appLogin.isSupported()).toBe(false);
    expect(sdk.TossAds.initialize.isSupported()).toBe(false);
    for (const action of [sdk.appLogin, sdk.IAP.getPendingOrders, sdk.IAP.completeProductGrant, sdk.loadFullScreenAd, sdk.showFullScreenAd, sdk.contactsViral, sdk.TossAds.initialize, sdk.TossAds.attachBanner]) expect(action).toThrow('토스 앱에서만');
    const cleanup = sdk.graniteEvent.addEventListener(); expect(cleanup).not.toThrow();
  });
});
