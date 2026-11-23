import { describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({
  Onest: () => ({ variable: 'var-onest', className: 'font-onest' }),
  Unbounded: () => ({ variable: 'var-unbounded', className: 'font-unbounded' }),
  Inter_Tight: () => ({ variable: 'var-inter-tight', className: 'font-inter-tight' }),
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

  it('serves Unbounded, Onest and Inter Tight through next/font on <html>', async () => {
    const { default: RootLayout } = await import('./layout');
    const html = RootLayout({ children: null }) as { props: { className: string } };
    expect(html.props.className.split(' ')).toEqual(
      expect.arrayContaining(['var-onest', 'var-unbounded', 'var-inter-tight']),
    );
  });
});
