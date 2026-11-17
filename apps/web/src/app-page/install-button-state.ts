/**
 * What the install button on `/app/[slug]` shows. M1 knows only guests (`buy`: payment without
 * registration, sign-in second) and «Скоро»; M2–M5 add `add_device`, `signing`, `install` and
 * `instructions` (spec §6.3).
 */
export type InstallCtx = {
  signedIn: boolean;
  app: {
    slug: string;
    accessLevel: string;
    latestVersion: { encrypted: boolean } | null;
  };
};

export type InstallState = {
  kind: 'buy' | 'unavailable';
  label: string;
  href?: string;
  /** Second action for visitors who have already paid. */
  signinHref?: string;
};

const UNAVAILABLE: InstallState = { kind: 'unavailable', label: 'Скоро' };

export function installButtonState(ctx: InstallCtx): InstallState {
  if (!ctx.app.latestVersion) return UNAVAILABLE;
  if (!ctx.signedIn) {
    const next = `/app/${encodeURIComponent(ctx.app.slug)}`;
    return {
      kind: 'buy',
      label: 'Установить',
      href: `/pricing?app=${encodeURIComponent(ctx.app.slug)}`,
      signinHref: `/signin?next=${encodeURIComponent(next)}`,
    };
  }
  return UNAVAILABLE;
}
