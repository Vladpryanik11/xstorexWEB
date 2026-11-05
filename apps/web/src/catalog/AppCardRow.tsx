import type { AppCard } from '@xstore/shared';
import { AppRow } from '@xstore/ui';
import { appHref } from './links';

/** One catalog row: subtitle, or the category when the admin left the subtitle empty. */
export function AppCardRow({ app }: { app: AppCard }) {
  return (
    <AppRow
      href={appHref(app.slug)}
      iconSrc={app.iconUrl}
      name={app.name}
      subtitle={app.subtitle ?? app.category?.name}
    />
  );
}
