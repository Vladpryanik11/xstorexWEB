import { describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: '--font-inter', className: 'font-inter' }),
}));

describe('root layout', () => {
  it('layout viewport keeps the page out of the notch', async () => {
    const { viewport } = await import('./layout');
    expect(viewport).toMatchObject({
      width: 'device-width',
      initialScale: 1,
      maximumScale: 1,
      themeColor: '#0c45b7',
    });
    // diyorde.com sets no viewport-fit: with `cover` landscape iPhone puts the logo under the notch.
    expect(viewport).not.toHaveProperty('viewportFit');
    expect(viewport).not.toHaveProperty('userScalable');
  });
});
