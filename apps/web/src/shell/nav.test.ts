import { describe, expect, it } from 'vitest';
import { isActive, navItems } from './nav';

describe('navItems', () => {
  it('guest menu', () => {
    expect(navItems(false).map((i) => i.label)).toEqual(['Блог', 'Вопросы', 'Поддержка']);
  });

  it('signed-in menu', () => {
    expect(navItems(true).map((i) => i.label)).toEqual([
      'Ваши устройства',
      'Профиль',
      'Блог',
      'Вопросы',
      'Поддержка',
    ]);
  });

  it('signed-in menu links', () => {
    expect(navItems(true).map((i) => i.href)).toEqual([
      '/devices',
      '/profile',
      '/blog',
      '/faq',
      '/support',
    ]);
  });
});

describe('isActive', () => {
  it('matches the section and its subpages only', () => {
    expect(isActive('/devices', '/devices')).toBe(true);
    expect(isActive('/devices/abc', '/devices')).toBe(true);
    expect(isActive('/devices-old', '/devices')).toBe(false);
    expect(isActive('/', '/devices')).toBe(false);
  });
});
