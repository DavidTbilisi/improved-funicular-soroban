// ============================================================================
// Registering the shell. One call, from the one module every page loads
// (src/nav.js), because eleven copies of a <script> tag in eleven <head>s is
// eleven places for it to be forgotten.
//
// The only thing with any subtlety in it is telling the TWO controller changes
// apart, because they mean opposite things to a learner:
//   • there was no controller when this page loaded → the worker just installed
//     for the first time, and the news is "this now works offline";
//   • there was one → a NEW worker replaced it, and the news is "you are
//     running the old files; reload when you like".
// A page that said "update ready" on a first visit would be lying, and one that
// said nothing at all after an update would leave a stale app with no way out.
//
// Registration is RELATIVE ('sw.js', not '/sw.js'): the app is served from the
// domain root locally and from /improved-funicular-soroban/ on GitHub Pages,
// and an absolute path would register out of scope on one of them.
// ============================================================================

export function registerShell({ onReady = () => {}, onUpdate = () => {} } = {}) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  // file:// has no service workers, and neither has an insecure origin — both
  // are normal ways to open this app, and neither is an error worth reporting.
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;

  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) onUpdate();
    else onReady();
  });

  return navigator.serviceWorker.register('sw.js').catch(err => {
    // A failed registration must never break the page: the app works online
    // exactly as it did before service workers existed.
    console.warn('[soroban] offline shell unavailable:', err && err.message);
    return null;
  });
}
