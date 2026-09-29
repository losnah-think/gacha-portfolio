// 0. Safe Global Property Definition (MUST BE AT THE VERY TOP)
console.log('🚀 App Initializing...');
if (typeof window !== 'undefined') {
  const safeDefine = (obj: any, prop: string, value: any) => {
    try {
      if (!(prop in obj)) {
        Object.defineProperty(obj, prop, {
          value,
          configurable: true,
          writable: true,
          enumerable: true,
        });
      }
    } catch (e) {
      console.warn(`⚠️ Failed to define ${prop}:`, e);
    }
  };

  if (typeof (window as any).globalThis === 'undefined') {
    safeDefine(window, 'globalThis', window);
  }

  const isPlainBrowserPreview = !(
    'nativeFlushQueue' in window ||
    (window as any).__fbBatchedBridge ||
    (window as any).ReactNativeMobile ||
    (window as any).ReactNativeWebView
  );

  if (isPlainBrowserPreview) {
    safeDefine(window, 'ReactNativeWebView', {
      postMessage: () => { },
    });
  }

  // ResizeObserver polyfill (often needed by animation libs)
  if (typeof (window as any).ResizeObserver === 'undefined') {
    safeDefine(window, 'ResizeObserver', class {
      observe() { }
      unobserve() { }
      disconnect() { }
    });
  }

  // IntersectionObserver polyfill
  if (typeof (window as any).IntersectionObserver === 'undefined') {
    safeDefine(window, 'IntersectionObserver', class {
      observe() { }
      unobserve() { }
      disconnect() { }
    });
  }

  // Crypto polyfill - Hermes 환경 대응
  try {
    if (typeof (window as any).crypto === 'undefined') {
      try {
        (window as any).crypto = {};
      } catch (_e) {
        safeDefine(window, 'crypto', {});
      }
    }
    if ((window as any).crypto && typeof (window as any).crypto.randomUUID !== 'function') {
      const uuidShim = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c: string) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      };

      const desc = Object.getOwnPropertyDescriptor((window as any).crypto, 'randomUUID');
      if (!desc || desc.configurable) {
        Object.defineProperty((window as any).crypto, 'randomUUID', {
          value: uuidShim,
          configurable: true,
          writable: true
        });
      }
    }
  } catch (_e) {
    console.warn('⚠️ Crypto polyfill failed:', _e);
  }
}

await import('./index.css')
const [{ StrictMode }, { MotionConfig }, { default: App }, { ErrorBoundary }, { ModalProvider }] = await Promise.all([
  import('react'),
  import('framer-motion'),
  import('./App.tsx'),
  import('./shared/components/ErrorBoundary.tsx'),
  import('./shared/components/ui'),
])

const WrappedApp = () => (
  <ErrorBoundary>
    <MotionConfig reducedMotion="user">
      <ModalProvider>
        <App />
      </ModalProvider>
    </MotionConfig>
  </ErrorBoundary>
);

// 1. App Entry Registration (Native First & Synchronous)
const isNative = typeof window !== 'undefined' && (
  'nativeFlushQueue' in window ||
  (window as any).__fbBatchedBridge ||
  (window as any).ReactNativeMobile
);

if (isNative) {
  try {
    // @ts-ignore — AppRegistry는 네이티브 런타임에서만 존재하며, Vite 웹 빌드에서는 이 분기를 타지 않음
    const { AppRegistry } = await import(/* @vite-ignore */ '@apps-in-toss/web-framework');
    if (AppRegistry) {
      AppRegistry.registerComponent('gacha', () => WrappedApp);
      AppRegistry.registerComponent('shared', () => WrappedApp);
      AppRegistry.registerComponent('Main', () => WrappedApp);
      console.log('✅ Native AppRegistry registered: gacha, shared, Main');
    } else {
      console.warn('⚠️ AppRegistry not found in Framework');
    }
  } catch (e) {
    console.error('Native AppRegistry failed:', e);
  }
}

// 2. Web Entry
if (!isNative && typeof document !== 'undefined') {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    import('react-dom/client').then(({ createRoot }) => {
      createRoot(rootElement).render(
        <StrictMode>
          <WrappedApp />
        </StrictMode>
      );
    }).catch(e => {
      console.error('Web init error:', e);
      // 모듈 로드 에러 시 화면에 직접 표시
      if (rootElement) {
        rootElement.innerHTML = `<div style="padding:24px;font-family:sans-serif">
          <h2 style="color:#e53e3e">앱 로드 실패</h2>
          <p style="color:#666;font-size:14px">앱을 불러오는 중 문제가 생겼어요. 새로고침 후 다시 시도해 주세요.</p>
          <button onclick="window.location.reload()" style="background:#3182f6;color:#fff;border:0;border-radius:12px;padding:12px 18px;font-size:15px;font-weight:700">새로고침</button>
        </div>`;
      }
    });
  }
}
