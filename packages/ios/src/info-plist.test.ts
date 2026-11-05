import { describe, expect, it } from 'vitest';
import { readInfo } from './info-plist.js';

const base = {
  CFBundleIdentifier: 'ru.test.app',
  CFBundleShortVersionString: '1.2',
  CFBundleVersion: '45',
  CFBundleExecutable: 'Test',
};

describe('readInfo', () => {
  it('maps the main fields', () => {
    const info = readInfo({
      ...base,
      CFBundleDisplayName: 'Тест',
      CFBundleName: 'TestName',
      MinimumOSVersion: '15.0',
      UIDeviceFamily: [1, 2],
    });
    expect(info).toEqual({
      name: 'Тест',
      bundleId: 'ru.test.app',
      version: '1.2',
      build: '45',
      minIos: '15.0',
      deviceFamily: [1, 2],
      executable: 'Test',
      iconNames: [],
    });
  });

  it('falls back to CFBundleName and the iPhone family', () => {
    const info = readInfo({ ...base, CFBundleName: 'TestName' });
    expect(info.name).toBe('TestName');
    expect(info.deviceFamily).toEqual([1]);
    expect(info.minIos).toBeUndefined();
  });

  it('collects icon names from every key without duplicates', () => {
    const info = readInfo({
      ...base,
      CFBundleIcons: { CFBundlePrimaryIcon: { CFBundleIconFiles: ['AppIcon60x60'] } },
      'CFBundleIcons~ipad': {
        CFBundlePrimaryIcon: { CFBundleIconFiles: ['AppIcon60x60', 'AppIcon76x76'] },
      },
      CFBundleIconFiles: ['Icon.png'],
      CFBundleIconFile: 'Icon-Legacy',
    });
    expect(info.iconNames).toEqual(['AppIcon60x60', 'AppIcon76x76', 'Icon.png', 'Icon-Legacy']);
  });

  it('accepts numeric strings in UIDeviceFamily', () => {
    expect(readInfo({ ...base, UIDeviceFamily: ['1', 2] }).deviceFamily).toEqual([1, 2]);
  });

  it('rejects a plist without bundle id, version or executable', () => {
    for (const key of ['CFBundleIdentifier', 'CFBundleExecutable'] as const) {
      const { [key]: _, ...rest } = base;
      expect(() => readInfo(rest)).toThrow();
    }
    const { CFBundleShortVersionString: _s, CFBundleVersion: _v, ...noVersion } = base;
    expect(() => readInfo(noVersion)).toThrow();
  });

  it('rejects an executable name with a path', () => {
    expect(() => readInfo({ ...base, CFBundleExecutable: '../x' })).toThrow();
    expect(() => readInfo({ ...base, CFBundleExecutable: 'a/b' })).toThrow();
  });
});
