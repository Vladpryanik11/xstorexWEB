import { redirect } from 'next/navigation';

/** Uploading moved onto «Приложения» (spec 2026-11-24 §2). */
export default function UploadPage() {
  redirect('/admin/apps');
}
