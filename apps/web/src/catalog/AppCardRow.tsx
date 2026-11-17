import type { AppCard } from '@xstore/shared';
import { AppRow } from '@xstore/ui';
import { AppPreview } from './AppPreview';
import { appHref } from './links';

/** One catalog row: subtitle, or the category when the admin left the subtitle empty. */
export function AppCardRow({ app }: { app: AppCard }) {
  const subtitle = app.subtitle ?? app.category?.name;
  return (
    <AppRow
      href={appHref(app.slug)}
      iconSrc={app.iconUrl}
      name={app.name}
      subtitle={subtitle}
      iconSlot={
        <AppPreview slug={app.slug} name={app.name} subtitle={subtitle} iconUrl={app.iconUrl} />
      }
    />
  );
}
