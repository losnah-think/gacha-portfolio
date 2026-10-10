import './index.css';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (root) root.textContent = '가차 포트폴리오를 불러오는 중입니다.';

if (import.meta.env.VITE_ENABLE_RUNTIME === 'true') {
  void import('./runtime').catch((error: unknown) => {
    console.error('Configured application could not start:', error);
    const root = document.getElementById('root');
    if (root) root.textContent = 'Application startup failed. Check your local integration configuration.';
  });
} else {
  void import('./portfolio/PortfolioDemo').then(({ PortfolioDemo }) => {
    if (root) {
      root.classList.add('portfolio-root');
      createRoot(root).render(<PortfolioDemo />);
    }
  }).catch((error: unknown) => {
    console.error('Portfolio demo could not start:', error);
    if (root) root.textContent = '포트폴리오를 불러오지 못했습니다. 페이지를 새로고침해 주세요.';
  });
}
