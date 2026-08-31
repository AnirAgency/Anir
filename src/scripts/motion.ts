/**
 * The whole motion layer: smooth scroll and scroll reveals.
 *
 * Under prefers-reduced-motion this module does nothing at all — Lenis is never
 * constructed, no observer is created, and the .motion class is never added, so
 * nothing is ever hidden. That is "completely disabled", not "shortened".
 *
 * The reveals are IntersectionObserver plus a CSS transition rather than GSAP
 * ScrollTrigger. Measured, tree-shaken and minified, GSAP + ScrollTrigger is
 * 115 kB against roughly 1 kB for this, and the effect specified — fade up 24px,
 * once, with a stagger and a fixed ease — is a CSS transition. ScrollTrigger
 * earns its weight on scrubbing, pinning and timelines, all of which are on
 * this project's do-not-build list.
 */
import Lenis from 'lenis';

const REVEAL_STAGGER_MS = 65;
/** Past this, a long group's last item would arrive noticeably late. */
const MAX_STAGGER_STEPS = 4;
/** Fire when the element has come 12% up from the bottom edge. */
const REVEAL_MARGIN = '0px 0px -12% 0px';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ----------------------------------------------------------------- reveals */

function initReveals() {
  const items = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  if (items.length === 0) return;

  // An element's group is its parent: the cards in a grid, the rows in a list,
  // the eyebrow and heading in a section head. Stagger is its index there, so
  // items that come into view together arrive one after another.
  const seen = new Map<Element, number>();
  const delays = new Map<Element, number>();

  for (const item of items) {
    const group = item.parentElement ?? document.body;
    const index = seen.get(group) ?? 0;
    seen.set(group, index + 1);
    delays.set(item, Math.min(index, MAX_STAGGER_STEPS) * REVEAL_STAGGER_MS);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target as HTMLElement;
        target.style.setProperty('--reveal-delay', `${delays.get(target) ?? 0}ms`);
        target.classList.add('is-revealed');
        // Once. Unobserving is what stops it re-animating on the way back up.
        observer.unobserve(target);
      }
    },
    { rootMargin: REVEAL_MARGIN, threshold: 0 }
  );

  for (const item of items) observer.observe(item);
}

/* ------------------------------------------------------------ smooth scroll */

function initSmoothScroll() {
  const lenis = new Lenis({ duration: 1.15 });

  const frame = (time: number) => {
    lenis.raf(time);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;

    const link = (event.target as Element | null)?.closest?.('a[href^="#"]');
    if (!(link instanceof HTMLAnchorElement)) return;

    const id = link.getAttribute('href');
    if (!id || id === '#') return;

    const target = document.querySelector<HTMLElement>(id);
    if (!target) return;

    event.preventDefault();

    // The skip link exists to get a keyboard user out of the header fast.
    // Gliding it down the page would defeat the point.
    const immediate = link.classList.contains('skip-link');
    lenis.scrollTo(target, { immediate });

    // Scrolling alone leaves the keyboard where it was. Move focus to the
    // destination so the next Tab continues from there.
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });

    if (history.replaceState) history.replaceState(null, '', id);
  });
}

/* -------------------------------------------------------------------- start */

if (!reduceMotion.matches) {
  initSmoothScroll();

  if ('IntersectionObserver' in window) {
    initReveals();
  } else {
    // No observer, no reveal — show everything rather than hide it forever.
    document.documentElement.classList.remove('motion');
  }
}
