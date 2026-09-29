import './index.css';

// This source-review snapshot stays disconnected until explicitly configured.
if (import.meta.env.VITE_ENABLE_RUNTIME === 'true') {
  void import('./runtime').catch((error: unknown) => {
    console.error('Configured application could not start:', error);
    const root = document.getElementById('root');
    if (root) root.textContent = 'Application startup failed. Check your local integration configuration.';
  });
} else {
  const root = document.getElementById('root');
  if (root) {
    const title = document.createElement('h1');
    title.textContent = 'Gacha · source portfolio';
    const description = document.createElement('p');
    description.textContent = 'This snapshot preserves the application source. Production credentials, assets and deployment configuration are excluded.';
    const setup = document.createElement('p');
    setup.textContent = 'To run the integrated application, configure your own backend and Firebase project, then enable VITE_ENABLE_RUNTIME. Authentication, ads and rewards require additional provider setup.';
    root.style.cssText = 'max-width:720px;margin:64px auto;padding:24px;line-height:1.7';
    root.append(title, description, setup);
  }
}
