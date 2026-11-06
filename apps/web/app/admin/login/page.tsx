import Link from 'next/link';
import s from '../../../src/admin/admin.module.css';
import { LoginForm } from '../../../src/admin/LoginForm';

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className={s.login}>
      <Link href="/">Xstore</Link>
      <h1>Вход для сотрудников</h1>
      <p>Введите пароль и код из приложения аутентификации.</p>
      <LoginForm next={next} />
    </main>
  );
}
