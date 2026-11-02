import { describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: '--font-inter', className: 'font-inter' }),
}));

describe('root layout', () => {
  it('layout viewport is cover', async () => {
    const { viewport } = await import('./layout');
    expect(viewport).toMatchObject({
      width: 'device-width',
      initialScale: 1,
      maximumScale: 1,
      viewportFit: 'cover',
      themeColor: '#0c45b7',
    });
    expect(viewport).not.toHaveProperty('userScalable');
  });
});
