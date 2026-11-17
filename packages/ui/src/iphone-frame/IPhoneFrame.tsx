import type { ReactNode } from 'react';
import styles from './IPhoneFrame.module.css';

export type IPhoneFrameProps = {
  children: ReactNode;
  className?: string;
};

/**
 * A screenshot inside an iPhone, after Magic UI «iPhone» (https://magicui.design/docs/components/iphone):
 * the content sits on the screen and an inline SVG draws the rim, bezel and Dynamic Island on top.
 * No external images.
 */
export function IPhoneFrame({ children, className }: IPhoneFrameProps) {
  return (
    <div className={className ? `${styles.frame} ${className}` : styles.frame} data-iphone-frame="">
      <div className={styles.screen}>{children}</div>
      <svg className={styles.bezel} viewBox="0 0 433 882" aria-hidden="true" focusable="false">
        <rect className={styles.rim} x="0.75" y="0.75" width="431.5" height="880.5" rx="74" />
        <path
          className={styles.glass}
          fillRule="evenodd"
          d="M74 8h285a66 66 0 0 1 66 66v734a66 66 0 0 1-66 66H74a66 66 0 0 1-66-66V74A66 66 0 0 1 74 8ZM76 19a55 55 0 0 0-55 55v734a55 55 0 0 0 55 55h281a55 55 0 0 0 55-55V74a55 55 0 0 0-55-55Z"
        />
        <rect className={styles.island} x="163" y="33" width="107" height="31" rx="15.5" />
      </svg>
    </div>
  );
}
