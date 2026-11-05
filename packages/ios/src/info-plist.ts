export type IpaInfo = {
  name: string;
  bundleId: string;
  version: string;
  build: string;
  minIos?: string;
  /** `UIDeviceFamily`: 1 iPhone, 2 iPad. */
  deviceFamily: number[];
  executable: string;
  iconNames: string[];
};

const MAX_LEN = 255;

function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  return s.length > 0 && s.length <= MAX_LEN ? s : undefined;
}

function dict(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter((s): s is string => s !== undefined) : [];
}

function primaryIconFiles(icons: unknown): string[] {
  return strings(dict(dict(icons)?.CFBundlePrimaryIcon)?.CFBundleIconFiles);
}

function deviceFamily(value: unknown): number[] {
  if (!Array.isArray(value)) return [1];
  const out = value
    .map((v) => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v))
    .filter((v): v is number => Number.isInteger(v));
  return out.length > 0 ? [...new Set(out)] : [1];
}

/** Reads the fields Xstore needs from a parsed `Info.plist`; throws when a required one is missing. */
export function readInfo(plist: Record<string, unknown>): IpaInfo {
  const bundleId = str(plist.CFBundleIdentifier);
  const executable = str(plist.CFBundleExecutable);
  const shortVersion = str(plist.CFBundleShortVersionString);
  const bundleVersion = str(plist.CFBundleVersion);
  const version = shortVersion ?? bundleVersion;
  const build = bundleVersion ?? shortVersion;
  if (!bundleId) throw new Error('CFBundleIdentifier is missing');
  if (!executable || executable.includes('/') || executable === '.' || executable === '..')
    throw new Error('CFBundleExecutable is missing or invalid');
  if (!version || !build)
    throw new Error('CFBundleShortVersionString and CFBundleVersion are missing');
  const name = str(plist.CFBundleDisplayName) ?? str(plist.CFBundleName) ?? executable;
  const iconNames = [
    ...primaryIconFiles(plist.CFBundleIcons),
    ...primaryIconFiles(plist['CFBundleIcons~ipad']),
    ...strings(plist.CFBundleIconFiles),
    ...strings(plist['CFBundleIconFiles~ipad']),
    ...[str(plist.CFBundleIconFile)].filter((s): s is string => s !== undefined),
  ];
  const minIos = str(plist.MinimumOSVersion);
  return {
    name,
    bundleId,
    version,
    build,
    ...(minIos ? { minIos } : {}),
    deviceFamily: deviceFamily(plist.UIDeviceFamily),
    executable,
    iconNames: [...new Set(iconNames)],
  };
}
