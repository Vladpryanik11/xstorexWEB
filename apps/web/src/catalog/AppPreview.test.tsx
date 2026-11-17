import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reduced = vi.hoisted(() => ({ value: false }));
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => reduced.value,
}));

import { AppCardRow } from './AppCardRow';

const app = {
  slug: 'testovoe-prilozhenie-1',
  name: 'Тестовое приложение 1',
  subtitle: 'Подзаголовок приложения 1',
  iconUrl: '/icons/1.png',
};

afterEach(() => {
  reduced.value = false;
});

describe('AppPreview (Morphing Dialog)', () => {
  it('the row title still links to the app page', () => {
    render(<AppCardRow app={app} />);
    expect(screen.getByRole('link', { name: /Тестовое приложение 1/ })).toHaveAttribute(
      'href',
      '/app/testovoe-prilozhenie-1',
    );
  });

  it('tapping the icon opens a preview dialog with install and details', () => {
    render(<AppCardRow app={app} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Быстрый просмотр: Тестовое приложение 1' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Тестовое приложение 1' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('Подзаголовок приложения 1');
    expect(screen.getByRole('link', { name: 'Установить' })).toHaveAttribute(
      'href',
      '/pricing?app=testovoe-prilozhenie-1',
    );
    expect(screen.getByRole('link', { name: 'Подробнее' })).toHaveAttribute(
      'href',
      '/app/testovoe-prilozhenie-1',
    );
    expect(dialog).toHaveAttribute('data-morph', 'true');
  });

  it('Escape closes the dialog and returns focus to the icon', async () => {
    // jsdom has no layout, so a shared-layout exit never settles; the morphing close is in e2e.
    reduced.value = true;
    render(<AppCardRow app={app} />);
    const trigger = screen.getByRole('button', { name: 'Быстрый просмотр: Тестовое приложение 1' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('Escape removes the morphing dialog even if the exit animation never settles', async () => {
    render(<AppCardRow app={app} />);
    const trigger = screen.getByRole('button', { name: 'Быстрый просмотр: Тестовое приложение 1' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-morph', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('does not morph under reduced motion', () => {
    reduced.value = true;
    render(<AppCardRow app={app} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Быстрый просмотр: Тестовое приложение 1' }),
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('data-morph', 'false');
  });
});
