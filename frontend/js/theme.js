import { readStorage, writeStorage } from './utils.js';

const media = window.matchMedia('(prefers-color-scheme: dark)');
let saved = readStorage('tk_theme', null);
if (saved !== 'light' && saved !== 'dark') saved = null;

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.getElementById('metaTheme')?.setAttribute('content', theme === 'dark' ? '#0c101a' : '#f4f7fb');
  const button = document.getElementById('themeBtn');
  if (button) button.setAttribute('aria-label', theme === 'dark' ? '切换为浅色主题' : '切换为深色主题');
}

applyTheme(saved ?? (media.matches ? 'dark' : 'light'));
media.addEventListener('change', () => { if (saved === null) applyTheme(media.matches ? 'dark' : 'light'); });
document.getElementById('themeBtn')?.addEventListener('click', () => {
  saved = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  writeStorage('tk_theme', saved); applyTheme(saved);
});
