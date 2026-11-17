import { describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'var-inter', className: 'font-inter' }),
  Manrope: () => ({ variable: 'var-manrope', className: 'font-manrope' }),
}));

describe('root layout', () => {
  it('layout viewport keeps the page out of the notch', async () => {
    const { viewport } = await import('./layout');
    expect(viewport).toMatchObject({
      width: 'device-width',
      initialScale: 1,
      maximumScale: 1,
      themeColor: '#f2f8fd',
    });
    // diyorde.com sets no viewport-fit: with `cover` landscape iPhone puts the logo under the notch.
    expect(viewport).not.toHaveProperty('viewportFit');
    expect(viewport).not.toHaveProperty('userScalable');
  });

  it('serves Manrope and Inter through next/font on <html>', async () => {
    const { default: RootLayout } = await import('./layout');
    const html = RootLayout({ children: null }) as { props: { className: string } };
    expect(html.props.className.split(' ')).toEqual(
      expect.arrayContaining(['var-inter', 'var-manrope']),
    );
  });
});
