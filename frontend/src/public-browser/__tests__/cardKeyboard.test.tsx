import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('original Card keyboard interaction', () => {
  it('activates public interactive cards with Enter and Space, honoring handlers and nested targets', async () => {
    vi.resetModules(); vi.stubEnv('VITE_PUBLIC_BROWSER', 'true');
    const { Card } = await import('../../shared/components/ui/Card');
    const onClick = vi.fn(); const onKeyDown = vi.fn();
    const card = render(<Card interactive onClick={onClick} onKeyDown={onKeyDown} data-testid="card">행운의 카드<button type="button">자식 버튼</button></Card>);
    const target = screen.getByTestId('card');
    expect(target.getAttribute('role')).toBe('button'); expect(target.tabIndex).toBe(0);
    expect(target.className).toContain('focus-visible:ring-2');
    fireEvent.keyDown(target, { key: 'Enter' }); fireEvent.keyDown(target, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2); expect(onKeyDown).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByRole('button', { name: '자식 버튼' }), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: '자식 버튼' }));
    expect(onClick).toHaveBeenCalledTimes(3);
    card.rerender(<Card interactive onClick={onClick} onKeyDown={(event) => event.preventDefault()} data-testid="card">행운의 카드</Card>);
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('preserves native Card semantics and leaves noninteractive public cards unchanged', async () => {
    vi.resetModules(); vi.stubEnv('VITE_PUBLIC_BROWSER', 'false');
    const { Card: NativeCard } = await import('../../shared/components/ui/Card');
    const onClick = vi.fn(); const onKeyDown = vi.fn();
    const native = render(<NativeCard interactive onClick={onClick} onKeyDown={onKeyDown} data-testid="native">네이티브 카드</NativeCard>);
    const target = screen.getByTestId('native');
    expect(target.getAttribute('role')).toBeNull();
    // Motion's existing whileTap already makes the native card focusable.
    expect(target.getAttribute('tabindex')).toBe('0');
    expect(target.className).not.toContain('focus-visible:ring');
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(onKeyDown).toHaveBeenCalledTimes(1); expect(onClick).not.toHaveBeenCalled();
    native.unmount(); vi.resetModules(); vi.stubEnv('VITE_PUBLIC_BROWSER', 'true');
    const { Card: PublicCard } = await import('../../shared/components/ui/Card');
    render(<PublicCard data-testid="reading">읽기 카드</PublicCard>);
    expect(screen.getByTestId('reading').getAttribute('role')).toBeNull();
    expect(screen.getByTestId('reading').getAttribute('tabindex')).toBeNull();
  });
});
