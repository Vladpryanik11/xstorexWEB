import { describe, expect, it } from 'vitest';
import { createUploadSchema, errorMessages, ipaInspectSchema, uploadViewSchema } from './index.js';

it('accepts a file name and a positive integer size', () => {
  expect(createUploadSchema.safeParse({ fileName: 'Тест.ipa', sizeBytes: 1 }).success).toBe(true);
  expect(createUploadSchema.safeParse({ fileName: '', sizeBytes: 1 }).success).toBe(false);
  expect(createUploadSchema.safeParse({ fileName: 'a.ipa', sizeBytes: 0 }).success).toBe(false);
  expect(createUploadSchema.safeParse({ fileName: 'a.ipa', sizeBytes: 1.5 }).success).toBe(false);
  expect(createUploadSchema.safeParse({ fileName: 'a'.repeat(256), sizeBytes: 1 }).success).toBe(
    false,
  );
});

it('parses an upload view', () => {
  const view = { id: 'u1', fileName: 'a.ipa', sizeBytes: 10, partSize: 64, status: 'uploading' };
  expect(uploadViewSchema.parse(view)).toEqual(view);
});

it('has a Russian message for UPLOAD_TOO_LARGE', () => {
  expect(errorMessages.UPLOAD_TOO_LARGE).toBe('Файл больше допустимого размера');
});

describe('ipaInspectSchema', () => {
  it('accepts what the worker writes', () => {
    const value = {
      name: 'Тест',
      bundleId: 'ru.test.app',
      version: '1.2',
      build: '45',
      deviceFamily: [1, 2],
      executable: 'Test',
      encrypted: false,
      sizeBytes: 10,
      sha256: 'ab',
      icon512Key: null,
      icon57Key: null,
    };
    expect(ipaInspectSchema.parse(value)).toEqual(value);
    expect(ipaInspectSchema.safeParse({ ...value, encrypted: 'no' }).success).toBe(false);
  });
});
