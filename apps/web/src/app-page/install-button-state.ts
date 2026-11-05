/**
 * What the install button on `/app/[slug]` shows. M1 knows only guests and «Скоро»;
 * M2–M5 add `add_device`, `buy`, `signing`, `install` and `instructions` (spec §6.3).
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
  kind: 'signin' | 'unavailable';
  label: string;
  href?: string;
};

const UNAVAILABLE: InstallState = { kind: 'unavailable', label: 'Скоро' };

export function installButtonState(ctx: InstallCtx): InstallState {
  if (!ctx.app.latestVersion) return UNAVAILABLE;
  if (!ctx.signedIn) {
    const next = `/app/${encodeURIComponent(ctx.app.slug)}`;
    return { kind: 'signin', label: 'Войти', href: `/signin?next=${encodeURIComponent(next)}` };
  }
  return UNAVAILABLE;
}
