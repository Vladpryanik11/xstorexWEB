import { act, fireEvent, render, screen } from '@testing-library/react';
import { ApiClientError } from '@xstore/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenInSafari } from './OpenInSafari';

const ORIGIN = 'https://xstorex.ru';
const TOKEN = 'T'.repeat(43);
const link = (token = TOKEN, inMs = 10 * 60_000) => ({
  token,
  expiresAt: new Date(Date.now() + inMs),
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  window.history.replaceState(null, '', '/get/iphone');
});
afterEach(() => {
  vi.useRealTimers();
});

const settle = () => act(() => vi.advanceTimersByTimeAsync(0));

describe('OpenInSafari', () => {
  it('Telegram: the button opens this page in Safari with the sign-in, the hint names ⋯', async () => {
    render(
      <OpenInSafari
        app="telegram"
        family="iphone"
        origin={ORIGIN}
        issue={vi.fn(async () => link())}
      />,
    );
    await settle();
    expect(screen.getByRole('heading', { name: 'Осталось открыть в Safari' })).toBeVisible();
    expect(
      screen.getByText('Подключить iPhone можно только в Safari. Вход сохранится.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Открыть в Safari' })).toHaveAttribute(
      'href',
      `x-safari-${ORIGIN}/get/iphone?h=${TOKEN}`,
    );
    expect(
      screen.getByText('Не открылось? Нажмите ⋯ вверху справа → «Открыть в Safari».'),
    ).toBeVisible();
    // «⋯ → Открыть в Safari» opens the address of this page: the sign-in goes with it.
    expect(window.location.search).toBe(`?h=${TOKEN}`);
  });

  it('Chrome: copy the link, then a note where to paste it', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <OpenInSafari
        app="chrome"
        family="iphone"
        origin={ORIGIN}
        issue={vi.fn(async () => link())}
      />,
    );
    await settle();
    expect(
      screen.getByText('Не открылось? Скопируйте ссылку и вставьте её в Safari.'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    await settle();
    expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/get/iphone?h=${TOKEN}`);
    expect(
      screen.getByText('Ссылка скопирована. Откройте Safari и вставьте её в адресную строку.'),
    ).toBeVisible();
  });

  it('when copying is blocked, the link is shown to copy by hand', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('no'))) },
    });
    render(
      <OpenInSafari app="vk" family="iphone" origin={ORIGIN} issue={vi.fn(async () => link())} />,
    );
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    await settle();
    expect(screen.getByRole('textbox', { name: 'Ссылка' })).toHaveValue(
      `${ORIGIN}/get/iphone?h=${TOKEN}`,
    );
  });

  it('a new link replaces the old one before it ends', async () => {
    const issue = vi
      .fn()
      .mockResolvedValueOnce(link('A'.repeat(43)))
      .mockResolvedValueOnce(link('B'.repeat(43)));
    render(<OpenInSafari app="telegram" family="iphone" origin={ORIGIN} issue={issue} />);
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000 - 30_000));
    expect(issue).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: 'Открыть в Safari' })).toHaveAttribute(
      'href',
      `x-safari-${ORIGIN}/get/iphone?h=${'B'.repeat(43)}`,
    );
    expect(window.location.search).toBe(`?h=${'B'.repeat(43)}`);
  });

  it('without a link the button still opens Safari, where the buyer signs in by code', async () => {
    const issue = vi.fn(async () => {
      throw new ApiClientError(500, 'INTERNAL', 'x');
    });
    render(<OpenInSafari app="telegram" family="ipad" origin={ORIGIN} issue={issue} />);
    await settle();
    expect(screen.getByText('Подключить iPad можно только в Safari.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Открыть в Safari' })).toHaveAttribute(
      'href',
      `x-safari-${ORIGIN}/get/iphone`,
    );
    expect(window.location.search).toBe('');
  });
});
