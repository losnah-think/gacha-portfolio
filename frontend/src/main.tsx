import './index.css';

const root = document.getElementById('root');
if (root) root.textContent = '가차를 불러오는 중입니다.';

void import('./runtime').catch((error: unknown) => {
  console.error('Gacha could not start:', error);
  if (root) root.textContent = '가차를 불러오지 못했습니다. 페이지를 새로고침해 주세요.';
});
