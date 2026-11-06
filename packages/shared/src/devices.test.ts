import { expect, it } from 'vitest';
import { renameDeviceSchema } from './devices.js';

it('trims device names and accepts up to 40 characters', () => {
  expect(renameDeviceSchema.parse({ name: '  My iPhone  ' }).name).toBe('My iPhone');
  expect(renameDeviceSchema.safeParse({ name: 'x'.repeat(40) }).success).toBe(true);
});

it('rejects empty and overlong device names', () => {
  expect(renameDeviceSchema.safeParse({ name: '   ' }).success).toBe(false);
  expect(renameDeviceSchema.safeParse({ name: 'x'.repeat(41) }).success).toBe(false);
});
