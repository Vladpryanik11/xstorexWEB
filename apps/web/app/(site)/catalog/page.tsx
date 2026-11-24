import { redirect } from 'next/navigation';

/** The catalog is two sections now (owner 2026-11-24); old links land on the first one. */
export default function Page() {
  redirect('/removed');
}
