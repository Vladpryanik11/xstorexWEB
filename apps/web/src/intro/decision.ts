/** localStorage key: `seen` once the visitor started or skipped the intro. */
export const INTRO_KEY = 'xstore.intro';

export type IntroEnv = {
  search: string;
  seen: string | null;
  reducedMotion: boolean;
  webdriver: boolean;
};

/**
 * Spec 2026-11-22-intro: first visit only; never with reduced motion, on a shared `?app=` link or
 * in an automated browser; `?intro=1` always. Self-contained: its source is inlined below.
 */
export function introDecision(env: IntroEnv): boolean {
  const query = new URLSearchParams(env.search);
  if (query.get('intro') === '1') return true;
  return !(env.webdriver || query.has('app') || env.reducedMotion || env.seen === 'seen');
}

/**
 * Runs in the HTML before the first paint and sets `<html data-intro="on">`, so the stage covers
 * the page from the start and the site never flashes underneath. Only constants go in here.
 */
export const introScript = `(function(){try{var seen=null;try{seen=localStorage.getItem(${JSON.stringify(INTRO_KEY)})}catch(e){}if((${introDecision.toString()})({search:location.search,seen:seen,reducedMotion:matchMedia("(prefers-reduced-motion: reduce)").matches,webdriver:!!navigator.webdriver}))document.documentElement.setAttribute("data-intro","on")}catch(e){}})()`;
