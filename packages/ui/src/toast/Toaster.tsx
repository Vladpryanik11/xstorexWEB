'use client';

import { Toaster as Sonner, toast } from 'sonner';
import styles from './Toaster.module.css';

export { toast };

/**
 * App-wide notifications on Sonner (https://21st.dev/@shadcn/components/sonner), styled for Xstore:
 * a dark `--x-text` pill with white text.
 */
export function Toaster() {
  return (
    <Sonner
      position="top-center"
      offset="5rem"
      mobileOffset="4.5rem"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: styles.toast,
          title: styles.title,
          description: styles.description,
          icon: styles.icon,
          actionButton: styles.action,
        },
      }}
    />
  );
}
