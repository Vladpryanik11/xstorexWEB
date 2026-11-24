'use client';
import type {
  AdminAppDetail,
  AdminAppListItem,
  AdminCategory,
  MediaUploadTicket,
} from '@xstore/shared';
import { toast } from '@xstore/ui';
import { useRef, useState } from 'react';
import { errorText, mutate } from '../api';
import s from './apps.module.css';

export type Tone = 'ok' | 'warn' | 'err' | 'info';

/** The row's status pill: what the app waits for, in the admin's words (spec 2026-11-24 §2). */
export function appState(app: AdminAppListItem): { text: string; tone: Tone } {
  if (app.status === 'hidden') return { text: 'Скрыто', tone: 'info' };
  if (app.status === 'published') return { text: 'В каталоге', tone: 'ok' };
  const b = app.publishBlockers;
  if (b.includes('NO_VERSION') && app.encrypted)
    return { text: 'Не подошло: файл защищён App Store. Нужен IPA без защиты', tone: 'err' };
  if (b.includes('NO_SECTION')) return { text: 'Ждёт раздела', tone: 'warn' };
  if (b.includes('NO_CATEGORY')) return { text: 'Ждёт подкатегории', tone: 'warn' };
  if (b.includes('NO_ICON')) return { text: 'Ждёт иконки', tone: 'warn' };
  if (b.includes('NO_VERSION')) return { text: 'Нет файла для установки', tone: 'err' };
  return { text: 'Черновик', tone: 'info' };
}

const MiB = 1024 ** 2;
const size = (bytes: number) =>
  bytes >= 1024 * MiB
    ? `${(bytes / 1024 / MiB).toFixed(1).replace('.', ',')} ГБ`
    : `${Math.max(1, Math.round(bytes / MiB))} МБ`;

/** A detail answer from the API, reduced to the fields the list shows. */
function toItem(prev: AdminAppListItem, d: AdminAppDetail): AdminAppListItem {
  return {
    ...prev,
    name: d.name,
    status: d.status,
    iconUrl: d.iconUrl,
    categoryId: d.categoryId,
    section: d.section,
    publishBlockers: d.publishBlockers,
  };
}

export type AppRowProps = {
  app: AdminAppListItem;
  categories: AdminCategory[];
  onChange: (app: AdminAppListItem) => void;
  onRemove: (id: string) => void;
};

/** One app of the one-screen admin: name, icon, section, subcategory, hide, delete. */
export function AppRow({ app, categories, onChange, onRemove }: AppRowProps) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dropping, setDropping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Set by Enter/Escape so the blur that follows the input's removal does not save again. */
  const settled = useRef(false);
  const root = `/admin/apps/${app.id}`;
  const state = appState(app);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  const patch = (body: Record<string, unknown>) =>
    run(async () => onChange(toItem(app, await mutate<AdminAppDetail>(root, 'PATCH', body))));

  function icon(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * MiB) {
      toast.error('Иконка: PNG или JPEG до 5 МБ');
      return;
    }
    void run(async () => {
      const ticket = await mutate<MediaUploadTicket>(`${root}/media/icon`, 'POST', {
        contentType: file.type,
        sizeBytes: file.size,
      });
      const res = await fetch(ticket.url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!res.ok) throw new Error('Не удалось загрузить иконку');
      onChange(
        toItem(
          app,
          await mutate<AdminAppDetail>(`${root}/media/icon/commit`, 'POST', { key: ticket.key }),
        ),
      );
    });
  }

  function saveName(value: string) {
    if (settled.current) return;
    settled.current = true;
    setEditing(false);
    const name = value.trim();
    if (name && name !== app.name) void patch({ name });
  }

  return (
    <li className={s.row} aria-label={app.name} aria-busy={busy || undefined}>
      <button
        type="button"
        className={`${s.icon} ${dropping ? s.iconDrop : ''}`}
        aria-label={`Сменить иконку ${app.name}`}
        title="Нажмите или перетащите картинку"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes('Files')) return;
          e.preventDefault();
          e.stopPropagation();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropping(false);
          icon(e.dataTransfer.files[0]);
        }}
      >
        {app.iconUrl ? (
          // biome-ignore lint/performance/noImgElement: media from S3, sizes are tiny
          <img src={app.iconUrl} alt="" width={48} height={48} />
        ) : (
          <span aria-hidden="true">+</span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => {
          icon(e.currentTarget.files?.[0]);
          e.currentTarget.value = '';
        }}
      />
      <div className={s.meta}>
        {editing ? (
          <input
            className={s.nameInput}
            aria-label="Название"
            defaultValue={app.name}
            maxLength={200}
            // biome-ignore lint/a11y/noAutofocus: the admin just asked to rename
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName(e.currentTarget.value);
              if (e.key === 'Escape') {
                settled.current = true;
                setEditing(false);
              }
            }}
            onBlur={(e) => saveName(e.currentTarget.value)}
          />
        ) : (
          <button
            type="button"
            className={s.name}
            aria-label={`Переименовать ${app.name}`}
            disabled={busy}
            onClick={() => {
              settled.current = false;
              setEditing(true);
            }}
          >
            {app.name}
          </button>
        )}
        <span className={s.sub}>
          {[app.latestVersion, app.sizeBytes === null ? null : size(app.sizeBytes)]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <div className={s.choices}>
          <select
            aria-label="Раздел"
            className={!app.section ? s.need : undefined}
            value={app.section ?? ''}
            disabled={busy}
            onChange={(e) => void patch({ section: e.currentTarget.value || null })}
          >
            <option value="">Выберите раздел</option>
            <option value="removed">Удалённые</option>
            <option value="premium">Премиум</option>
          </select>
          <select
            aria-label="Подкатегория"
            className={app.section && !app.categoryId ? s.need : undefined}
            value={app.categoryId ?? ''}
            disabled={busy}
            onChange={(e) => void patch({ categoryId: e.currentTarget.value || null })}
          >
            <option value="">Подкатегория</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className={s.pill} data-tone={state.tone}>
            {state.text}
          </span>
        </div>
      </div>
      <div className={s.actions}>
        {confirming ? (
          <>
            <span>Удалить {app.name}?</span>
            <button
              type="button"
              className={s.danger}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await mutate(root, 'DELETE');
                  onRemove(app.id);
                })
              }
            >
              Да, удалить
            </button>
            <button type="button" className={s.link} onClick={() => setConfirming(false)}>
              Нет
            </button>
          </>
        ) : (
          <>
            {app.status === 'hidden' ? (
              <button
                type="button"
                className={s.link}
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    onChange(toItem(app, await mutate<AdminAppDetail>(`${root}/unhide`, 'POST'))),
                  )
                }
              >
                Показать
              </button>
            ) : app.status === 'published' ? (
              <button
                type="button"
                className={s.link}
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    onChange(toItem(app, await mutate<AdminAppDetail>(`${root}/hide`, 'POST', {}))),
                  )
                }
              >
                Скрыть
              </button>
            ) : null}
            <button
              type="button"
              className={`${s.link} ${s.linkDanger}`}
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              Удалить
            </button>
          </>
        )}
      </div>
    </li>
  );
}
