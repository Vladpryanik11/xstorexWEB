import styles from './ProgressiveBlur.module.css';

export type ProgressiveBlurProps = {
  /** The edge the blur grows toward. */
  side: 'start' | 'end';
  className?: string;
  /** Hidden edges fade out (CSS on `[data-visible="false"]`). */
  visible?: boolean;
  'data-rail-edge'?: string;
};

/**
 * Edge blur that grows toward one side, adapted from Magic UI «Progressive Blur»
 * (https://magicui.design/docs/components/progressive-blur): stacked `backdrop-filter` layers,
 * each masked to a band, the strongest at the edge. Pure CSS, no JS.
 */
export function ProgressiveBlur({
  side,
  className,
  visible = true,
  ...rest
}: ProgressiveBlurProps) {
  return (
    <div
      className={className ? `${styles.root} ${className}` : styles.root}
      data-side={side}
      data-visible={visible ? 'true' : 'false'}
      aria-hidden="true"
      {...rest}
    >
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
