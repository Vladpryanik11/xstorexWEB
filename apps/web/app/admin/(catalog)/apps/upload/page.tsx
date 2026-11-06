import { requireStaff } from '../../../../../src/auth/session';
import { UploadDropzone } from '../../../../../src/upload/UploadDropzone';

export default async function UploadPage() {
  const session = await requireStaff('/admin/apps/upload');
  return (
    <>
      <h1>Загрузка IPA</h1>
      <UploadDropzone ownerId={session.user.id} />
    </>
  );
}
