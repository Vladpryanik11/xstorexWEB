import bplistCreator from 'bplist-creator';
import plist from 'plist';
import { describe, expect, it } from 'vitest';
import { parsePlist } from './plist.js';

const dict = { CFBundleIdentifier: 'ru.test.app', UIDeviceFamily: [1, 2], Nested: { A: 'Б' } };

describe('parsePlist', () => {
  it('parses XML plists', () => {
    expect(parsePlist(Buffer.from(plist.build(dict), 'utf8'))).toEqual(dict);
  });

  it('parses binary plists', () => {
    expect(parsePlist(bplistCreator(dict))).toEqual(dict);
  });

  it('rejects a plist whose root is not a dictionary', () => {
    expect(() => parsePlist(Buffer.from(plist.build(['a']), 'utf8'))).toThrow();
  });

  it('rejects garbage', () => {
    expect(() => parsePlist(Buffer.from('not a plist'))).toThrow();
    expect(() => parsePlist(Buffer.from('bplist00garbage'))).toThrow();
  });
});
