// ============================================================================
// Top navigation — one bar shared by every page. Each page calls mountNav(key)
// with its own key so the current tab is marked. Links are plain relative hrefs
// (separate .html pages), so it works as a static site on GitHub Pages.
//
// It is also where the offline shell registers itself: this is the one module
// every page loads, so it is the only place the registration cannot be
// forgotten when a page is added. The bar carries the single line of feedback
// that belongs to it — "works offline" the first time, "update ready" after a
// deploy — and nothing else about it is visible.
// ============================================================================
import { registerShell } from './offline/register.js';

const PAGES = [
  ['today', 'index.html', 'Today'],
  ['explore', 'explore.html', 'Explore'],
  ['practice', 'practice.html', 'Guided practice'],
  ['trainer', 'trainer.html', 'Mult / Div trainer'],
  ['drills', 'drills.html', 'Codec drills'],
  ['anzan', 'anzan.html', 'Flash anzan'],
  ['yomiage', 'yomiage.html', 'Read-aloud'],
  ['exam', 'exam.html', 'Kyu exam'],
  ['vault', 'vault.html', 'Vault'],
  ['game', 'game.html', 'Village'],
  ['reference', 'reference.html', 'Reference'],
];

// How long the "works offline" note stays up. It is news the first time and
// clutter for ever after, so it says its piece and goes.
const READY_MS = 6000;

export function mountNav(current) {
  const el = document.getElementById('nav');
  if (!el) return;
  el.innerHTML = `<nav class="topnav">${PAGES.map(([key, href, label]) =>
    `<a href="${href}"${key === current ? ' class="active" aria-current="page"' : ''}>${label}</a>`).join('')}` +
    `<span class="nav-shell" id="navShell" hidden aria-live="polite"></span></nav>`;

  // On a phone the bar is one scrolling row (see styles.css), so the page you
  // are on can be off-screen at load — which reads as "the nav has lost me".
  const here = el.querySelector('a.active');
  if (here && here.scrollIntoView) here.scrollIntoView({ block: 'nearest', inline: 'center' });

  const chip = document.getElementById('navShell');
  const say = (text, cls, action) => {
    if (!chip) return;
    chip.hidden = false;
    chip.className = `nav-shell ${cls}`;
    chip.innerHTML = action ? `<button type="button">${text}</button>` : text;
    if (action) chip.querySelector('button').addEventListener('click', action);
  };

  registerShell({
    onReady: () => {
      say('✓ works offline', 'ok');
      setTimeout(() => { if (chip) chip.hidden = true; }, READY_MS);
    },
    // The reload is the learner's to take: they may be mid-round, and swapping
    // the page under a flash-anzan round would cost them it.
    onUpdate: () => say('↻ update ready', 'update', () => location.reload()),
  });
}
