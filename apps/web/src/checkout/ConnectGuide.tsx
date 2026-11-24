import type { DeviceFamily } from '@xstore/shared';
import styles from './connect.module.css';
import { familyName } from './connect-step';

/**
 * Four screenshots of the iOS screens with captions (spec v2 §4, step 2). The owner took them on
 * his iPhone 2026-11-24 11:10–11:20; they are cropped to the place to tap, which is ringed in blue,
 * without the status bar and the account card (variant А, owner 11:21). The step text stands above
 * its screenshot (owner 11:31). iOS asks «Установить»
 * twice, so the steps are four.
 */
export function ConnectGuide({ family }: { family: DeviceFamily }) {
  const name = familyName(family);
  const steps = [
    {
      src: '/get/connect-1.webp',
      w: 562,
      h: 178,
      caption: `Нажмите «Подключить ${name}», затем «Разрешить»`,
    },
    {
      src: '/get/connect-2.webp',
      w: 562,
      h: 238,
      caption: 'Откройте Настройки → «Профиль загружен»',
    },
    { src: '/get/connect-3.webp', w: 590, h: 426, caption: 'Нажмите «Установить» вверху справа' },
    {
      src: '/get/connect-4.webp',
      w: 466,
      h: 262,
      caption: 'Ещё раз «Установить» и вернитесь в Safari',
    },
  ];
  return (
    <ol className={styles.guide}>
      {steps.map(({ src, w, h, caption }, i) => (
        <li key={src} className={styles.shot}>
          <p className={styles.caption}>
            <span className={styles.num} aria-hidden="true">
              {i + 1}
            </span>
            <span>{caption}</span>
          </p>
          {/* biome-ignore lint/performance/noImgElement: four small static screenshots, 9–16 KB each */}
          <img className={styles.photo} src={src} alt="" width={w} height={h} loading="lazy" />
        </li>
      ))}
    </ol>
  );
}

/**
 * Developer Mode, the screen before the profile (owner 2026-11-24 11:39–11:43, variant Б): his
 * screenshots found through the Settings search, the place to tap ringed in blue; the prompt after
 * the restart is said in words only (owner 11:42).
 */
export function DevModeGuide({ family }: { family: DeviceFamily }) {
  const name = familyName(family);
  const steps: { caption: string; src?: string; w?: number; h?: number }[] = [
    {
      caption: 'Откройте Настройки и найдите «Режим разработчика»',
      src: '/get/dev-1.webp',
      w: 590,
      h: 278,
    },
    { caption: 'Включите переключатель', src: '/get/dev-2.webp', w: 590, h: 182 },
    { caption: 'Нажмите «Перезагрузить»', src: '/get/dev-3.webp', w: 466, h: 400 },
    { caption: `После перезагрузки нажмите «Включить» и введите код-пароль ${name}` },
  ];
  return (
    <ol className={styles.guide}>
      {steps.map(({ caption, src, w, h }, i) => (
        <li key={caption} className={styles.shot}>
          <p className={styles.caption}>
            <span className={styles.num} aria-hidden="true">
              {i + 1}
            </span>
            <span>{caption}</span>
          </p>
          {src ? (
            // biome-ignore lint/performance/noImgElement: three small static screenshots
            <img className={styles.photo} src={src} alt="" width={w} height={h} loading="lazy" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
