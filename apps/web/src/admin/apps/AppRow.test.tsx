import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminAppListItem, AdminCategory } from '@xstore/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRow, appState } from './AppRow';

const categories: AdminCategory[] = [
  { id: 'c1', slug: 'music', name: 'Музыка', icon: 'music', sort: 1, appCount: 0 },
  { id: 'c2', slug: 'games', name: 'Игры', icon: 'games', sort: 2, appCount: 0 },
];

const app = (over: Partial<AdminAppListItem> = {}): AdminAppListItem => ({
  id: 'a1',
  slug: 'spotify',
  name: 'Spotify',
  status: 'draft',
  iconUrl: 'https://media/icon.png',
  category: null,
  categoryId: null,
  section: null,
  latestVersion: '8.9.42',
  sizeBytes: 98 * 1024 ** 2,
  encrypted: false,
  publishBlockers: ['NO_SECTION', 'NO_CATEGORY'],
  updatedAt: '2026-11-24T18:00:00Z',
  ...over,
});

function stubFetch(reply: (url: string, init: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const body = reply(url, init);
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status: body === undefined ? 204 : 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('appState', () => {
  it('says what the app waits for, in plain words', () => {
    expect(appState(app()).text).toBe('Ждёт раздела');
    expect(appState(app({ section: 'removed', publishBlockers: ['NO_CATEGORY'] })).text).toBe(
      'Ждёт подкатегории',
    );
    expect(appState(app({ status: 'published', publishBlockers: [] }))).toEqual({
      text: 'В каталоге',
      tone: 'ok',
    });
    expect(appState(app({ status: 'hidden' })).text).toBe('Скрыто');
    expect(appState(app({ encrypted: true, publishBlockers: ['NO_VERSION'] })).text).toBe(
      'Не подошло: файл защищён App Store. Нужен IPA без защиты',
    );
    expect(
      appState(app({ publishBlockers: ['NO_ICON'], section: 'premium', categoryId: 'c1' })).text,
    ).toBe('Ждёт иконки');
  });
});

describe('AppRow', () => {
  it('shows icon, name, version, size and the two choices', () => {
    render(<AppRow app={app()} categories={categories} onChange={() => {}} onRemove={() => {}} />);
    const row = screen.getByRole('listitem', { name: 'Spotify' });
    expect(within(row).getByText('8.9.42 · 98 МБ')).toBeInTheDocument();
    expect(within(row).getByRole('combobox', { name: 'Раздел' })).toHaveValue('');
    expect(within(row).getByRole('combobox', { name: 'Подкатегория' })).toHaveValue('');
    expect(within(row).getByText('Ждёт раздела')).toBeInTheDocument();
  });

  it('saves the section and passes the updated app up', async () => {
    const fetchMock = stubFetch(() => ({ ...app(), section: 'premium' }));
    const onChange = vi.fn();
    render(<AppRow app={app()} categories={categories} onChange={onChange} onRemove={() => {}} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Раздел' }), {
      target: { value: 'premium' },
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/admin/apps/a1');
    expect(init).toMatchObject({ method: 'PATCH', body: JSON.stringify({ section: 'premium' }) });
  });

  it('renames in place: Enter saves, Escape cancels', async () => {
    const fetchMock = stubFetch(() => ({ ...app(), name: 'Spotify Premium' }));
    const onChange = vi.fn();
    render(<AppRow app={app()} categories={categories} onChange={onChange} onRemove={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Переименовать Spotify' }));
    const input = screen.getByRole('textbox', { name: 'Название' });
    fireEvent.change(input, { target: { value: 'Отмена' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Переименовать Spotify' }));
    const again = screen.getByRole('textbox', { name: 'Название' });
    fireEvent.change(again, { target: { value: 'Spotify Premium' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ name: 'Spotify Premium' }),
    });
  });

  it('asks before deleting', async () => {
    const fetchMock = stubFetch(() => undefined);
    const onRemove = vi.fn();
    render(<AppRow app={app()} categories={categories} onChange={() => {}} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(screen.getByText('Удалить Spotify?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Нет' }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    fireEvent.click(screen.getByRole('button', { name: 'Да, удалить' }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('a1'));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
  });
});
