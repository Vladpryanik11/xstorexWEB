import { describe, expect, it } from 'vitest';
import { parseDescription } from './description';

describe('parseDescription', () => {
  it('keeps plain lines as paragraphs', () => {
    expect(parseDescription('Первый абзац.\n\nВторой абзац.')).toEqual([
      { kind: 'p', text: 'Первый абзац.' },
      { kind: 'p', text: 'Второй абзац.' },
    ]);
  });

  it('turns «• » and «- » lines into one list and a colon line before it into a heading', () => {
    expect(parseDescription('Вступление.\nЧто внутри:\n• Чаты\n- Звонки\n\nФинал.')).toEqual([
      { kind: 'p', text: 'Вступление.' },
      { kind: 'h', text: 'Что внутри' },
      { kind: 'ul', items: ['Чаты', 'Звонки'] },
      { kind: 'p', text: 'Финал.' },
    ]);
  });

  it('leaves a colon line without a list as a paragraph', () => {
    expect(parseDescription('Важно:\nТекст.')).toEqual([
      { kind: 'p', text: 'Важно:' },
      { kind: 'p', text: 'Текст.' },
    ]);
  });

  it('ignores empty bullets and trims spaces', () => {
    expect(parseDescription('  • \n•  Один  ')).toEqual([{ kind: 'ul', items: ['Один'] }]);
  });
});
