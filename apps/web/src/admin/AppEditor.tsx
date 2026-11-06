'use client';
import type {
  AdminAppDetail,
  AdminCategory,
  AdminVersion,
  MediaKind,
  MediaUploadTicket,
} from '@xstore/shared';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import s from './admin.module.css';
import { blockerLabel, errorText, mutate, statusLabel } from './api';
import { DataTable } from './DataTable';
import { FormField } from './FormField';

export function AppEditor({
  initial,
  initialVersions,
  categories,
}: {
  initial: AdminAppDetail;
  initialVersions: AdminVersion[];
  categories: AdminCategory[];
}) {
  const [app, setApp] = useState(initial);
  const [versions, setVersions] = useState(initialVersions);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const root = `/admin/apps/${app.id}`;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await action();
      setMessage('Сохранено');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function media(kind: MediaKind, file: File) {
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 ** 2)
      throw new Error('Выберите PNG или JPEG размером до 5 МБ');
    const ticket = await mutate<MediaUploadTicket>(`${root}/media/${kind}`, 'POST', {
      contentType: file.type,
      sizeBytes: file.size,
    });
    const res = await fetch(ticket.url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!res.ok) throw new Error('Не удалось загрузить изображение');
    setApp(await mutate(`${root}/media/${kind}/commit`, 'POST', { key: ticket.key }));
  }
  async function versionAction(id: string, action: string) {
    const updated = await mutate<AdminVersion>(`/admin/versions/${id}/${action}`, 'POST');
    setVersions((v) => v.map((item) => (item.id === id ? updated : item)));
    // The blockers change when a version is published/unpublished.
    const { adminRequest } = await import('./api');
    setApp(await adminRequest(root));
  }
  return (
    <>
      <h1>{app.name}</h1>
      <p>Статус: {statusLabel[app.status]}</p>
      {app.status === 'published' && <Link href={`/app/${app.slug}`}>Открыть на сайте</Link>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <section className={s.card} aria-labelledby="app-card">
        <h2 id="app-card">Карточка приложения</h2>
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const text = (name: string) => String(data.get(name) ?? '').trim();
            const optional = (name: string) => text(name) || null;
            void run(async () =>
              setApp(
                await mutate(root, 'PATCH', {
                  name: text('name'),
                  slug: text('slug'),
                  subtitle: optional('subtitle'),
                  description: optional('description'),
                  developer: optional('developer'),
                  categoryId: optional('categoryId'),
                  rightsBasis: optional('rightsBasis'),
                  accessLevel: text('access') === 'free' ? 'free' : `addon:${text('addon')}`,
                  removedFromAppStore: data.has('removed'),
                  rating: text('rating') ? Number(text('rating')) : null,
                  ratingCount: text('ratingCount') ? Number(text('ratingCount')) : null,
                  languages: text('languages')
                    .split(',')
                    .map((v) => v.trim())
                    .filter(Boolean),
                  itunesId: optional('itunesId'),
                }),
              ),
            );
          }}
        >
          <div className={s.fields}>
            <FormField label="Название">
              <input name="name" defaultValue={app.name} required maxLength={200} />
            </FormField>
            <FormField label="Адрес страницы">
              <input
                name="slug"
                defaultValue={app.slug}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                required
                maxLength={80}
              />
            </FormField>
            <FormField label="Подзаголовок">
              <input name="subtitle" defaultValue={app.subtitle ?? ''} maxLength={200} />
            </FormField>
            <FormField label="Разработчик">
              <input name="developer" defaultValue={app.developer ?? ''} maxLength={200} />
            </FormField>
            <FormField label="Категория">
              <select name="categoryId" defaultValue={app.categoryId ?? ''}>
                <option value="">Не выбрана</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Доступ">
              <select name="access" defaultValue={app.accessLevel === 'free' ? 'free' : 'addon'}>
                <option value="free">Бесплатно</option>
                <option value="addon">Дополнение к тарифу</option>
              </select>
            </FormField>
            <FormField label="Код дополнения">
              <input
                name="addon"
                defaultValue={app.accessLevel.replace(/^addon:/, '').replace(/^free$/, '')}
                pattern="[a-z0-9-]{1,40}"
                placeholder="Код тарифа"
              />
            </FormField>
            <FormField label="Рейтинг">
              <input
                name="rating"
                type="number"
                min="0"
                max="5"
                step="0.1"
                defaultValue={app.rating ?? ''}
              />
            </FormField>
            <FormField label="Количество оценок">
              <input
                name="ratingCount"
                type="number"
                min="0"
                step="1"
                defaultValue={app.ratingCount ?? ''}
              />
            </FormField>
            <FormField label="Языки через запятую">
              <input
                name="languages"
                defaultValue={app.languages.join(', ')}
                placeholder="ru, en"
              />
            </FormField>
            <FormField label="Идентификатор App Store">
              <input
                name="itunesId"
                inputMode="numeric"
                pattern="[0-9]{1,20}"
                defaultValue={app.itunesId ?? ''}
              />
            </FormField>
          </div>
          <FormField label="Описание">
            <textarea name="description" maxLength={20000} defaultValue={app.description ?? ''} />
          </FormField>
          <FormField label="Основание для распространения">
            <textarea
              name="rightsBasis"
              required
              maxLength={2000}
              defaultValue={app.rightsBasis ?? ''}
            />
          </FormField>
          <label>
            <input name="removed" type="checkbox" defaultChecked={app.removedFromAppStore} />{' '}
            Удалено из App Store
          </label>
          <div>
            <button disabled={busy} type="submit">
              Сохранить карточку
            </button>
          </div>
        </form>
      </section>
      <section className={s.card} aria-labelledby="images">
        <h2 id="images">Изображения</h2>
        <p className={s.muted}>PNG или JPEG до 5 МБ. Не более 20 скриншотов.</p>
        <div className={s.fields}>
          {(
            [
              ['icon', 'Иконка'],
              ['banner', 'Баннер'],
              ['screenshot', 'Скриншот'],
            ] as const
          ).map(([kind, label]) => (
            <FormField key={kind} label={label}>
              <input
                type="file"
                accept="image/png,image/jpeg"
                disabled={busy}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = '';
                  if (file) void run(() => media(kind, file));
                }}
              />
            </FormField>
          ))}
        </div>
        <div className={s.media}>
          {app.iconUrl && (
            <Image unoptimized width={96} height={96} src={app.iconUrl} alt="Иконка приложения" />
          )}
          {app.bannerUrl && (
            <Image unoptimized width={96} height={96} src={app.bannerUrl} alt="Баннер приложения" />
          )}
        </div>
        <ol className={s.items}>
          {app.screenshots.map((shot, i) => (
            <li key={shot.key}>
              <Image unoptimized src={shot.url} alt={`Скриншот ${i + 1}`} width="60" height="90" />
              <button
                type="button"
                disabled={busy || i === 0}
                aria-label={`Переместить скриншот ${i + 1} выше`}
                onClick={() =>
                  void run(async () => {
                    const keys = app.screenshots.map((x) => x.key);
                    [keys[i - 1], keys[i]] = [keys[i] ?? '', keys[i - 1] ?? ''];
                    setApp(await mutate(`${root}/screenshots/order`, 'PUT', { keys }));
                  })
                }
              >
                Выше
              </button>
              <button
                type="button"
                disabled={busy || i === app.screenshots.length - 1}
                aria-label={`Переместить скриншот ${i + 1} ниже`}
                onClick={() =>
                  void run(async () => {
                    const keys = app.screenshots.map((x) => x.key);
                    [keys[i], keys[i + 1]] = [keys[i + 1] ?? '', keys[i] ?? ''];
                    setApp(await mutate(`${root}/screenshots/order`, 'PUT', { keys }));
                  })
                }
              >
                Ниже
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label={`Удалить скриншот ${i + 1}`}
                onClick={() =>
                  void run(async () => setApp(await mutate(`${root}/screenshots/${i}`, 'DELETE')))
                }
              >
                Удалить
              </button>
            </li>
          ))}
        </ol>
      </section>
      <h2>Версии</h2>
      <DataTable
        caption="Версии приложения"
        headings={['Версия', 'Файл', 'Изменения', 'Публикация']}
      >
        {versions.map((v) => (
          <tr key={v.id}>
            <td>
              {v.version} ({v.build})<br />
              {v.minIos && `iOS ${v.minIos}+`}
            </td>
            <td>
              {Math.ceil(v.sizeBytes / 1024 ** 2)} МБ{v.encrypted && <p>Защищено FairPlay</p>}
            </td>
            <td>
              <form
                className={s.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  const changelog =
                    String(new FormData(e.currentTarget).get('changelog') ?? '').trim() || null;
                  void run(async () => {
                    const next = await mutate<AdminVersion>(`/admin/versions/${v.id}`, 'PATCH', {
                      changelog,
                    });
                    setVersions((items) => items.map((item) => (item.id === v.id ? next : item)));
                  });
                }}
              >
                <FormField label={`Что нового в версии ${v.version}`}>
                  <textarea name="changelog" maxLength={4000} defaultValue={v.changelog ?? ''} />
                </FormField>
                <button type="submit" disabled={busy}>
                  Сохранить изменения версии
                </button>
              </form>
            </td>
            <td>
              <p>{statusLabel[v.status] ?? 'Отклонено'}</p>
              <button
                type="button"
                disabled={busy || v.encrypted}
                onClick={() =>
                  void run(() =>
                    versionAction(v.id, v.status === 'published' ? 'unpublish' : 'publish'),
                  )
                }
              >
                {v.status === 'published' ? 'Снять версию с публикации' : 'Опубликовать версию'}
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
      <section className={s.card}>
        <h2>Публикация</h2>
        {app.publishBlockers.length > 0 && (
          <ul aria-label="Что нужно для публикации">
            {app.publishBlockers.map((b) => (
              <li key={b}>{blockerLabel[b]}</li>
            ))}
          </ul>
        )}
        {app.status !== 'published' && app.status !== 'hidden' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(async () => setApp(await mutate(`${root}/publish`, 'POST')))}
          >
            Опубликовать приложение
          </button>
        )}
        {app.status === 'hidden' ? (
          <>
            <p>Причина скрытия: {app.hiddenReason}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(async () => setApp(await mutate(`${root}/unhide`, 'POST')))}
            >
              Вернуть из скрытых
            </button>
          </>
        ) : (
          <form
            className={s.form}
            onSubmit={(e) => {
              e.preventDefault();
              const reason = String(new FormData(e.currentTarget).get('reason'));
              void run(async () => setApp(await mutate(`${root}/hide`, 'POST', { reason })));
            }}
          >
            <FormField label="Причина скрытия">
              <textarea name="reason" required maxLength={500} />
            </FormField>
            <div>
              <button type="submit" disabled={busy}>
                Скрыть по жалобе
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
