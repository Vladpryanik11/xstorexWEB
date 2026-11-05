import styles from './FactsStrip.module.css';

export type Fact = { label: string; value: string };

export type FactsStripProps = {
  facts: Fact[];
};

/** App page facts: label over value, columns divided by hairlines; scrolls sideways when narrow. */
export function FactsStrip({ facts }: FactsStripProps) {
  return (
    <dl className={styles.strip}>
      {facts.map((fact) => (
        <div key={fact.label} className={styles.fact}>
          <dt className={styles.label}>{fact.label}</dt>
          <dd className={styles.value}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
