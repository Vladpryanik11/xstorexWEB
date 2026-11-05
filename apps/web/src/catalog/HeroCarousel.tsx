import type { BannerCard } from '@xstore/shared';
import { Rail, SpotBanner } from '@xstore/ui';
import { appHref } from './links';

/** Hero carousel: the home collection with layout `banner`, apps with a banner image only. */
export function HeroCarousel({ banners }: { banners: BannerCard[] }) {
  if (banners.length === 0) return null;
  return (
    <Rail label="Баннеры">
      {banners.map((b) => (
        <SpotBanner
          key={b.slug}
          href={appHref(b.slug)}
          imageSrc={b.imageUrl}
          title={b.name}
          subtitle={b.subtitle}
        />
      ))}
    </Rail>
  );
}
