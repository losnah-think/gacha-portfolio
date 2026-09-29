import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logErrorBoundary } from '../../utils/analytics';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * 전역 에러 바운더리 — React 렌더 트리에서 발생하는 크래시를 잡아
 * 화이트 스크린 대신 에러 정보를 표시합니다.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
    logErrorBoundary('App', `${error.message}\n${errorInfo.componentStack || ''}`.slice(0, 2000));
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          minHeight: '100dvh',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 24,
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
          fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, sans-serif',
          backgroundColor: 'var(--color-paper)',
          color: 'var(--color-toss-gray-900)',
          textAlign: 'center',
        }}>
          <img
            src="/images/reward-mascot.png"
            alt=""
            width={112}
            height={112}
            style={{ alignSelf: 'center', marginBottom: 20, objectFit: 'contain' }}
          />
          <h2 style={{ fontSize: 19, lineHeight: 1.35, fontWeight: 700, margin: 0 }}>
            잠깐 문제가 생겼어요
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-toss-gray-500)', marginTop: 8, marginBottom: 20 }}>
            새로 고치면 대부분 해결돼요.
          </p>

          <button
            onClick={() => window.location.reload()}
            style={{
              minHeight: 48,
              background: 'var(--color-toss-blue)',
              color: 'white',
              border: '2px solid var(--color-ink-deep)',
              borderRadius: 8,
              boxShadow: 'var(--shadow-hard)',
              padding: '12px 20px',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            다시 시도
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
