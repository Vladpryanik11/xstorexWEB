export type ResumeStore = {
  get(file: File): string | null;
  set(file: File, id: string): void;
  remove(file: File): void;
};

/** Isolate saved upload IDs by administrator; browser storage may be disabled. */
export function createResumeStore(ownerId: string): ResumeStore {
  const key = (file: File) =>
    `xstore:upload:${ownerId}:${file.name}:${file.size}:${file.lastModified}`;
  return {
    get(file) {
      try {
        return localStorage.getItem(key(file));
      } catch {
        return null;
      }
    },
    set(file, id) {
      try {
        localStorage.setItem(key(file), id);
      } catch {}
    },
    remove(file) {
      try {
        localStorage.removeItem(key(file));
      } catch {}
    },
  };
}
