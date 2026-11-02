import Link from 'next/link';
import styles from './Footer.module.css';

const groups = [
  [
    { href: '/blog', label: 'Блог' },
    { href: '/faq', label: 'Вопросы' },
    { href: '/support', label: 'Поддержка' },
  ],
  [
    { href: '/terms', label: 'Условия' },
    { href: '/privacy', label: 'Конфиденциальность' },
  ],
];

function TelegramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.6 3.2 2.5 10.6c-.8.3-.8 1.4 0 1.7l4.7 1.7 1.8 5.6c.2.7 1.1.9 1.6.4l2.6-2.5 4.7 3.5c.6.4 1.4.1 1.6-.6l3.4-15.4c.2-.9-.6-1.6-1.3-1.3Z"
      />
      <path fill="#fff" d="m9.1 13.8 8.6-6.6-6.9 7.6-.3 3.1z" />
    </svg>
  );
}

export function Footer() {
  const telegram = process.env.NEXT_PUBLIC_TELEGRAM_URL;

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <Link className={styles.brand} href="/">
            {/* biome-ignore lint/performance/noImgElement: a 36px static SVG needs no optimisation */}
            <img src="/brand/mark.svg" alt="" width={36} height={36} />
            <span>Xstore</span>
          </Link>
          {telegram ? (
            <a
              className={styles.social}
              href={telegram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram"
            >
              <TelegramIcon />
            </a>
          ) : null}
        </div>
        <nav className={styles.groups} aria-label="Разделы сайта">
          {groups.map((links) => (
            <ul key={links[0]?.href}>
              {links.map((link) => (
                <li key={link.href}>
                  <Link className={styles.link} href={link.href}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </nav>
        <div className={styles.base}>
          <p className={styles.small}>© 2026 Xstore</p>
        </div>
      </div>
    </footer>
  );
}
