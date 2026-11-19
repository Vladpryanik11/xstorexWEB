import type { Metadata } from 'next';
import { orNotFound, serverApi } from '../../../../src/api/server';
import { Wizard } from '../../../../src/checkout/Wizard';

export const metadata: Metadata = {
  title: 'Оформление доступа',
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ orderId: string }> };

/** Wizard after the payment page: «Проверяем оплату…», then the access, the password offer and «Дальше: подключить iPhone». */
export default async function OrderPage({ params }: Props) {
  const { orderId } = await params;
  const api = await serverApi();
  // Someone else's order, or no session at all, answers 404 like an unknown id.
  const order = await orNotFound(api.getOrder(orderId));
  const access = await api.getAccess();
  return (
    <Wizard
      initialOrder={order}
      hasPassword={access.hasPassword === true}
      hasDevice={access.state.kind === 'active' && access.state.device !== null}
    />
  );
}
