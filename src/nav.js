// ============================================================================
// Top navigation — one bar shared by every page. Each page calls mountNav(key)
// with its own key so the current tab is marked. Links are plain relative hrefs
// (separate .html pages), so it works as a static site on GitHub Pages.
// ============================================================================
const PAGES = [
  ['home', 'home.html', 'Today'],
  ['explore', 'index.html', 'Explore'],
  ['practice', 'practice.html', 'Guided practice'],
  ['trainer', 'trainer.html', 'Mult / Div trainer'],
  ['drills', 'drills.html', 'Codec drills'],
  ['game', 'game.html', 'Village'],
  ['reference', 'reference.html', 'Reference'],
];

export function mountNav(current) {
  const el = document.getElementById('nav');
  if (!el) return;
  el.innerHTML = `<nav class="topnav">${PAGES.map(([key, href, label]) =>
    `<a href="${href}"${key === current ? ' class="active" aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}
