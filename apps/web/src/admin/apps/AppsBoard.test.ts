import { expect, it } from 'vitest';
import { rejectText } from './AppsBoard';

it('a turned-down file says why and what to do, keeping «IPA» in capitals', () => {
  expect(rejectText('IPA_NOT_ZIP')).toBe(
    'Не подошло: файл не является IPA-архивом или повреждён. Загрузите другой IPA',
  );
  expect(rejectText('DUPLICATE_VERSION')).toBe('Не подошло: эта версия уже загружена');
  expect(rejectText(null)).toBe('Не подошло: не удалось прочитать файл. Загрузите другой IPA');
});
