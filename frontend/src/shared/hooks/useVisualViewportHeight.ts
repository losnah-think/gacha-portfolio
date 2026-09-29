import { useEffect, useState } from 'react';

export const useVisualViewportHeight = (onResize?: () => void) => {
  const [height, setHeight] = useState('100dvh');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;
    let frame = 0;
    const updateHeight = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setHeight(`${Math.round(viewport.height)}px`);
        onResize?.();
      });
    };

    updateHeight();
    viewport.addEventListener('resize', updateHeight);
    viewport.addEventListener('scroll', updateHeight);

    return () => {
      window.cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', updateHeight);
      viewport.removeEventListener('scroll', updateHeight);
    };
  }, [onResize]);

  return height;
};
