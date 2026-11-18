import { describe, expect, it } from 'vitest';
import { deviceKind } from './device';

describe('deviceKind', () => {
  it('iPhone, iPad and iPod are iOS', () => {
    expect(deviceKind('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe('ios');
    expect(deviceKind('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 5)).toBe('ios');
    expect(deviceKind('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)', 5)).toBe('ios');
  });

  it('iPadOS asks for the desktop site as a Mac with touch', () => {
    expect(deviceKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5)).toBe(
      'ios',
    );
  });

  it('a Mac without touch, Windows and Android are not iOS', () => {
    expect(deviceKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 0)).toBe(
      'desktop',
    );
    expect(deviceKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0', 0)).toBe('desktop');
    expect(deviceKind('Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140.0 Mobile', 5)).toBe(
      'desktop',
    );
  });
});
