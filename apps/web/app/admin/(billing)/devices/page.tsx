import type { WaitingDevice } from '@xstore/shared';
import { adminServer } from '../../../../src/admin/server';
import { WaitingDevices } from '../../../../src/admin/WaitingDevices';
import { requireStaff } from '../../../../src/auth/session';

export default async function WaitingDevicesPage() {
  await requireStaff('/admin/devices');
  const devices = await adminServer<WaitingDevice[]>('/devices/waiting');
  return (
    <>
      <h1>Ждут сертификата</h1>
      <p>
        Скопируйте UDID, отправьте поставщику и загрузите присланные файлы на странице устройства.
        Покупатель видит «Готовим ваш iPhone, обычно до 24 часов».
      </p>
      <WaitingDevices devices={devices} now={new Date()} />
    </>
  );
}
