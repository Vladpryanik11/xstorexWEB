/**
 * Category icons drawn for Xstore (never DIYORDE files), 16px line icons in currentColor.
 * The admin picks one by name; unknown names get the generic grid.
 */
const PATHS: Record<string, string> = {
  games:
    'M5 6h6a3 3 0 0 1 3 3v1.5a1.5 1.5 0 0 1-2.6 1L10 10H6l-1.4 1.5A1.5 1.5 0 0 1 2 10.5V9a3 3 0 0 1 3-3ZM5 7.5v2M4 8.5h2M10.5 8h.01M11.5 9h.01',
  photo: 'M2.5 5.5h2l1-1.5h5l1 1.5h2v7h-11zM8 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  video: 'M2.5 4.5h8v7h-8zM10.5 7l3-2v6l-3-2',
  music:
    'M6 11.5V3.5l7-1.5v8M6 11.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM13 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
  social: 'M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z',
  tools:
    'M10 2.5a3 3 0 0 0-2.8 4L2.8 10.9a1.4 1.4 0 0 0 2 2l4.4-4.4A3 3 0 0 0 13.5 6l-1.8 1.8-1.8-.5-.5-1.8z',
  education: 'M1.5 6 8 3l6.5 3L8 9zM4.5 7.5V11c2 1.3 5 1.3 7 0V7.5',
  books: 'M3 3h4a1 1 0 0 1 1 1v9a1 1 0 0 0-1-1H3zM13 3H9a1 1 0 0 0-1 1v9a1 1 0 0 1 1-1h4z',
  health: 'M8 13.5S2.5 10.3 2.5 6.3A2.8 2.8 0 0 1 8 5a2.8 2.8 0 0 1 5.5 1.3c0 4-5.5 7.2-5.5 7.2Z',
  finance: 'M2.5 4.5h11v7h-11zM2.5 7h11M4.5 9.5h2',
  travel:
    'M8 14s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 10 8 14 8 14ZM8 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  news: 'M2.5 3.5h9v9h-9zM11.5 6h2v5.5a1 1 0 0 1-2 0M4.5 6h5M4.5 8.5h5M4.5 11h3',
  shopping: 'M3 5.5h10l-1 8H4zM5.5 5.5V5a2.5 2.5 0 0 1 5 0v.5',
  entertainment: 'M8 2.5l1.7 3.4 3.8.6-2.8 2.6.7 3.8L8 11.1l-3.4 1.8.7-3.8-2.8-2.6 3.8-.6z',
  navigation: 'M13.5 2.5 2.5 7l4.5 2 2 4.5z',
  weather: 'M4.5 12.5a2.5 2.5 0 0 1 0-5 3.5 3.5 0 0 1 6.8-.5 2.5 2.5 0 0 1 .2 5.5z',
};

const GRID = 'M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z';

export function CategoryIcon({ name }: { name: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? GRID} />
    </svg>
  );
}
