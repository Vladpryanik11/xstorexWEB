import type { AppCard } from '@xstore/shared';
import { AppPreview } from './AppPreview';

/** One catalog row: subtitle, or the category when the admin left the subtitle empty. */
export function AppCardRow({ app }: { app: AppCard }) {
  const subtitle = app.subtitle ?? app.category?.name;
  return (
    <AppPreview
      variant="row"
      slug={app.slug}
      name={app.name}
      subtitle={subtitle}
      iconUrl={app.iconUrl}
    />
  );
}
