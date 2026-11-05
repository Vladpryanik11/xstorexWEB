import { AppIcon } from '../app-icon/AppIcon';
import styles from './IconTile.module.css';

export type IconTileProps = {
  href: string;
  iconSrc?: string;
  name: string;
};

export function IconTile({ href, iconSrc, name }: IconTileProps) {
  return (
    <a href={href} className={styles.tile}>
      <AppIcon src={iconSrc} alt="" size={76} />
      <span className={styles.name}>{name}</span>
    </a>
  );
}
