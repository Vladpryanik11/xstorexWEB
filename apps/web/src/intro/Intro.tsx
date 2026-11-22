'use client';

import { useEffect, useRef, useState } from 'react';
import { INTRO_KEY, introScript } from './decision';
import { createIntro } from './engine';
import { introLogoFont, introMonoFont } from './fonts';
import s from './intro.module.css';

const markSeen = () => {
  try {
    localStorage.setItem(INTRO_KEY, 'seen');
  } catch {}
};

/**
 * Intro «Бортовой компьютер» on the home page (spec 2026-11-22-intro). `IntroGate` decides before
 * the first paint; the stage is in the HTML for everyone but hidden by CSS unless
 * `<html data-intro>` is set. Once it is done, the component leaves the page.
 */
export function Intro() {
  const root = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'pending' | 'on' | 'off'>('pending');

  useEffect(() => {
    setPhase(document.documentElement.dataset.intro === 'on' ? 'on' : 'off');
  }, []);

  useEffect(() => {
    if (phase !== 'on' || !root.current) return;
    const intro = createIntro(root.current, s, {
      onStart: markSeen,
      onDone: () => setPhase('off'),
    });
    return () => intro.dispose();
  }, [phase]);

  if (phase === 'off') return null;

  return (
    <div
      ref={root}
      className={`${s.root} ${introLogoFont.variable} ${introMonoFont.variable}`}
      data-intro-root=""
    >
      <div
        className={s.stage}
        data-part="stage"
        role="dialog"
        aria-modal="true"
        aria-label="Интро Xstorex"
      >
        <canvas className={s.space} data-part="space" />
        <div className={s.hud} data-part="hud" aria-hidden="true">
          <i className={`${s.corner} ${s.tl}`} />
          <i className={`${s.corner} ${s.tr}`} />
          <i className={`${s.corner} ${s.bl}`} />
          <i className={`${s.corner} ${s.br}`} />
          <div className={`${s.readout} ${s.tl}`}>
            XSTOREX · <b>бортовой компьютер</b>
          </div>
          <div className={`${s.readout} ${s.tr}`}>
            T+ <b data-part="clock">00:00.00</b>
          </div>
          <div className={`${s.readout} ${s.br}`}>
            RA <b data-part="ra">05h 35m 17s</b> · DEC <b>−05° 23′</b>
          </div>
        </div>
        <div className={s.log} data-part="log" aria-live="polite" />
        <div className={s.center}>
          <div className={s.logo} data-part="logo" role="img" aria-label="XSTOREX" />
          <div className={s.rule} data-part="rule" />
          <div className={s.tag} data-part="tag" />
          <div className={s.sub} data-part="sub" />
        </div>
        <div className={s.gate} data-part="gate">
          <div className={s.gateLabel}>Система готова к запуску</div>
          <button className={s.start} data-part="start" type="button">
            ЗАПУСК&nbsp;▸
          </button>
          <div className={s.gateHint}>Включите звук</div>
        </div>
        <button className={s.skip} data-part="skip" type="button">
          Пропустить ›
        </button>
      </div>
      <div className={s.flash} data-part="flash" />
    </div>
  );
}

/** The pre-paint decision. A constant built from our own code, no user input. */
export function IntroGate() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: constant script, see decision.ts
  return <script dangerouslySetInnerHTML={{ __html: introScript }} />;
}
