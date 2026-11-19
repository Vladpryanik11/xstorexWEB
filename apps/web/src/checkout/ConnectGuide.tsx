import type { DeviceFamily } from '@xstore/shared';
import styles from './connect.module.css';
import { familyName } from './connect-step';

type ScreenProps = { family: DeviceFamily; name: string };

/** Screen height in the 180-wide drawing: a tall iPhone, a squarer iPad. */
const height = (family: DeviceFamily) => (family === 'ipad' ? 240 : 320);

/** Safari: the connect button pressed, iOS asks to allow the download. */
function SafariScreen({ family, name }: ScreenProps) {
  const h = height(family);
  return (
    <svg viewBox={`0 0 180 ${h}`} className={styles.screen} aria-hidden="true" focusable="false">
      <rect className={styles.paper} width="180" height={h} />
      <rect className={styles.bar} x="16" y="14" width="148" height="18" rx="9" />
      <rect className={styles.line} x="16" y="46" width="96" height="8" rx="4" />
      <rect className={styles.blueFill} x="16" y="64" width="148" height="26" rx="13" />
      <text className={styles.onBlue} x="90" y="81" textAnchor="middle">
        Подключить {name}
      </text>
      <rect className={styles.dim} width="180" height={h} />
      <rect className={styles.sheet} x="16" y="108" width="148" height="92" rx="14" />
      <text className={styles.small} x="90" y="132" textAnchor="middle">
        Разрешить загрузку?
      </text>
      <line className={styles.rule} x1="16" y1="146" x2="164" y2="146" />
      <text className={styles.muted} x="90" y="164" textAnchor="middle">
        Игнорировать
      </text>
      <rect className={styles.tap} x="24" y="173" width="132" height="22" rx="11" />
      <text className={styles.key} x="90" y="189" textAnchor="middle">
        Разрешить
      </text>
    </svg>
  );
}

/** Settings: the row that appears at the top once the file is downloaded. */
function SettingsScreen({ family }: ScreenProps) {
  const h = height(family);
  return (
    <svg viewBox={`0 0 180 ${h}`} className={styles.screen} aria-hidden="true" focusable="false">
      <rect className={styles.paper} width="180" height={h} />
      <text className={styles.heading} x="16" y="34">
        Настройки
      </text>
      <rect className={styles.bar} x="16" y="46" width="148" height="18" rx="9" />
      <rect className={styles.sheet} x="12" y="76" width="156" height="38" rx="12" />
      <circle className={styles.soft} cx="34" cy="95" r="11" />
      <rect className={styles.line} x="52" y="88" width="80" height="6" rx="3" />
      <rect className={styles.lineSoft} x="52" y="99" width="56" height="5" rx="2.5" />
      <rect className={styles.tap} x="12" y="124" width="156" height="30" rx="12" />
      <text className={styles.key} x="24" y="144">
        Профиль загружен
      </text>
      <rect className={styles.sheet} x="12" y="166" width="156" height="58" rx="12" />
      <rect className={styles.line} x="24" y="180" width="100" height="6" rx="3" />
      <rect className={styles.line} x="24" y="200" width="76" height="6" rx="3" />
    </svg>
  );
}

/** The install screen: «Установить» in the top right corner. */
function InstallScreen({ family }: ScreenProps) {
  const h = height(family);
  return (
    <svg viewBox={`0 0 180 ${h}`} className={styles.screen} aria-hidden="true" focusable="false">
      <rect className={styles.paper} width="180" height={h} />
      <text className={styles.muted} x="16" y="32">
        Отменить
      </text>
      <rect className={styles.tap} x="92" y="16" width="80" height="24" rx="12" />
      <text className={styles.key} x="132" y="33" textAnchor="middle">
        Установить
      </text>
      <rect className={styles.sheet} x="12" y="58" width="156" height="84" rx="14" />
      <rect className={styles.icon} x="24" y="72" width="28" height="28" rx="6.3" />
      <text className={styles.small} x="60" y="84">
        Xstore
      </text>
      <text className={styles.muted} x="60" y="98">
        подключение
      </text>
      <rect className={styles.line} x="24" y="114" width="124" height="6" rx="3" />
      <rect className={styles.lineSoft} x="24" y="126" width="92" height="5" rx="2.5" />
    </svg>
  );
}

/**
 * Three schematic pictures of the iOS screens with captions (spec v2 §4, step 2). Own drawings,
 * no Apple material; real screenshots replace them after the check on a real iPhone.
 */
export function ConnectGuide({ family }: { family: DeviceFamily }) {
  const name = familyName(family);
  const steps = [
    { Screen: SafariScreen, caption: `Нажмите «Подключить ${name}» и «Разрешить»` },
    { Screen: SettingsScreen, caption: 'Откройте Настройки → «Профиль загружен»' },
    { Screen: InstallScreen, caption: 'Нажмите «Установить» и вернитесь в Safari' },
  ];
  return (
    <ol className={styles.guide}>
      {steps.map(({ Screen, caption }, i) => (
        <li key={caption} className={styles.shot}>
          <div className={styles.device} data-family={family}>
            <Screen family={family} name={name} />
          </div>
          <p className={styles.caption}>
            <span className={styles.num} aria-hidden="true">
              {i + 1}
            </span>
            <span>{caption}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}
