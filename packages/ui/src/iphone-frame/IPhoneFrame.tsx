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
        {/* A ring, not a solid rect: the body must not cover the screen under it. */}
        <path
          className={styles.rim}
          fillRule="evenodd"
          d="M74.75 0.75h283.5a74 74 0 0 1 74 74v732.5a74 74 0 0 1-74 74h-283.5a74 74 0 0 1-74-74V74.75a74 74 0 0 1 74-74ZM74 8h285a66 66 0 0 1 66 66v734a66 66 0 0 1-66 66H74a66 66 0 0 1-66-66V74A66 66 0 0 1 74 8Z"
        />
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
