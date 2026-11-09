/* Подготовка к ОГЭ/ЕГЭ — клиентская часть (без фреймворков) */
'use strict';

// ================= утилиты =================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
let ME = null;

async function api(url, opts = {}) {
  const o = { method: opts.method || 'GET', headers: {} };
  if (opts.body instanceof FormData) o.body = opts.body;
  else if (opts.body !== undefined) { o.body = JSON.stringify(opts.body); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(url, o);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && ME) { ME = null; render(); }
    throw new Error(data.error || 'Ошибка запроса');
  }
  return data;
}
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 2600);
}
const fail = (e) => toast(e.message || String(e), true);
const fmtDate = (s) => { if (!s) return ''; const d = new Date(s.includes('T') || s.length <= 10 ? s : s.replace(' ', 'T') + 'Z'); return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); };
const fmtDateTime = (s) => { if (!s) return ''; const d = new Date(s.replace(' ', 'T') + 'Z'); return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ');
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return n + ' ' + (m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c); };
const gradeBadge = (g, big) => (g ? `<span class="grade g${g}${big ? ' big' : ''}">${g}</span>` : '');
const examBadge = (e) => (e && e !== 'any' ? `<span class="badge">${esc(e)}</span>` : '');
const isTutor = () => ME && ME.role === 'tutor';
const SUBJECTS = ['Математика (профиль)', 'Математика (база)', 'Математика', 'Русский язык', 'Физика', 'Химия', 'Биология', 'Информатика', 'Обществознание', 'История', 'Литература', 'География', 'Английский язык', 'Другое'];

// ================= темы оформления =================
const SEASONS = {
  winter: { name: 'Зима', icon: '❄️', accent: '#2f6fdb', accent2: '#8fd3fe', decor: ['❄', '❅', '❆'] },
  spring: { name: 'Весна', icon: '🌸', accent: '#2f9e5a', accent2: '#f4a3c4', decor: ['🌸', '🌱', '🌷'] },
  summer: { name: 'Лето', icon: '☀️', accent: '#e07b0c', accent2: '#2bb3d9', decor: ['🌻', '🦋', '☀️'] },
  autumn: { name: 'Осень', icon: '🍁', accent: '#c4501b', accent2: '#e3a72f', decor: ['🍁', '🍂', '🍃'] },
};
const PRESETS = ['#2f6fdb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0891b2', '#475569'];
const DEFAULT_THEME = { mode: 'season', season: 'auto', color: '#7c3aed', dark: 'auto', decor: true };

function currentSeason() {
  const m = new Date().getMonth() + 1;
  return m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn';
}
function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  return [h, s * 100, l * 100];
}
const hsl = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
function luminance(hex) {
  const c = [1, 3, 5].map((i) => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function getTheme() {
  if (ME && ME.theme) return { ...DEFAULT_THEME, ...ME.theme };
  try { return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem('theme') || '{}') }; } catch { return DEFAULT_THEME; }
}
function applyTheme(t = getTheme()) {
  const root = document.documentElement;
  const dark = t.dark === 'auto' ? matchMedia('(prefers-color-scheme: dark)').matches : !!t.dark;
  root.classList.toggle('dark', dark);
  let accent, accent2, decor;
  if (t.mode === 'custom') {
    accent = t.color;
    const [h, s] = hexToHsl(t.color);
    accent2 = hsl(h + 35, Math.min(90, s + 10), 68);
    decor = ['✦', '✧', '•'];
  } else {
    const s = SEASONS[t.season === 'auto' ? currentSeason() : t.season] || SEASONS.winter;
    accent = s.accent; accent2 = s.accent2; decor = s.decor;
  }
  const [h, s] = hexToHsl(accent);
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-2', accent2);
  root.style.setProperty('--accent-text', luminance(accent) > 0.55 ? '#111' : '#fff');
  root.style.setProperty('--bg', dark ? hsl(h, Math.min(s, 25), 8) : hsl(h, Math.min(s, 55), 96));
  try { localStorage.setItem('theme', JSON.stringify(t)); } catch {}
  renderDecor(t.decor ? decor : null);
}
function renderDecor(chars) {
  const box = $('#decor');
  const key = chars ? chars.join('') : '';
  if (box.dataset.key === key) return;
  box.dataset.key = key; box.innerHTML = '';
  if (!chars) return;
  for (let i = 0; i < 16; i++) {
    const sp = document.createElement('span');
    sp.textContent = chars[i % chars.length];
    sp.style.left = Math.random() * 100 + 'vw';
    sp.style.fontSize = 12 + Math.random() * 16 + 'px';
    sp.style.animationDuration = 14 + Math.random() * 18 + 's';
    sp.style.animationDelay = -Math.random() * 30 + 's';
    if (chars[0] === '❄' || chars[0] === '✦') sp.style.color = 'var(--accent)';
    box.appendChild(sp);
  }
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

// ================= загрузка файлов =================
async function uploadFiles(fileList, shared) {
  const fd = new FormData();
  [...fileList].forEach((f) => fd.append('files', f));
  if (shared) fd.append('shared', '1');
  return api('/api/files', { method: 'POST', body: fd });
}
function fileChip(f, removable) {
  return `<div class="file-chip"><span>${fileIcon(f.orig_name)}</span>
    <a href="/api/files/${f.id}/download" target="_blank" rel="noopener">${esc(f.orig_name)}</a>
    <span class="sz">${fmtSize(f.size)}</span>
    ${removable ? `<button class="btn ghost sm" data-rm-file="${f.id}" type="button" aria-label="Убрать">✕</button>` : ''}</div>`;
}
function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].includes(ext)) return '🖼️';
  if (ext === 'pdf') return '📕';
  if (['doc', 'docx', 'odt', 'rtf', 'txt'].includes(ext)) return '📄';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['ppt', 'pptx'].includes(ext)) return '📽️';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return '🎧';
  if (['mp4', 'mov', 'webm'].includes(ext)) return '🎬';
  return '📎';
}
/** Виджет загрузки: возвращает объект с массивом загруженных файлов */
function mountUploader(root, { shared = false, onChange } = {}) {
  const state = { files: [] };
  root.innerHTML = `<div class="drop" tabindex="0">📎 Перетащите файлы сюда или <b>нажмите, чтобы выбрать</b><div class="small">до 25 МБ, до 10 файлов за раз</div></div>
    <input type="file" multiple hidden><div class="files" style="margin-top:8px"></div>`;
  const drop = $('.drop', root), input = $('input', root), list = $('.files', root);
  const draw = () => { list.innerHTML = state.files.map((f) => fileChip(f, true)).join(''); onChange && onChange(state.files); };
  const send = async (fl) => {
    if (!fl.length) return;
    drop.textContent = 'Загрузка…';
    try { state.files.push(...(await uploadFiles(fl, shared))); draw(); } catch (e) { fail(e); }
    drop.innerHTML = '📎 Перетащите файлы сюда или <b>нажмите, чтобы выбрать</b><div class="small">до 25 МБ, до 10 файлов за раз</div>';
  };
  drop.onclick = () => input.click();
  drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = () => { send(input.files); input.value = ''; };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); send(e.dataTransfer.files); };
  list.onclick = async (e) => {
    const id = e.target.dataset.rmFile; if (!id) return;
    await api('/api/files/' + id, { method: 'DELETE' }).catch(() => {});
    state.files = state.files.filter((f) => String(f.id) !== id); draw();
  };
  return state;
}

// ================= модальное окно =================
function modal(html, onMount) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="card modal">${html}</div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  onMount && onMount($('.modal', bg), close);
  return close;
}
function confirmBox(text) {
  return new Promise((res) => {
    modal(`<h2>Подтвердите</h2><p>${esc(text)}</p><div class="row" style="justify-content:flex-end">
      <button class="btn secondary" data-close>Отмена</button><button class="btn" id="cOk" style="background:var(--danger);color:#fff">Да, удалить</button></div>`,
    (m, close) => { $('#cOk', m).onclick = () => { close(); res(true); }; $('[data-close]', m).addEventListener('click', () => res(false)); });
  });
}

// ================= авторизация =================
function renderAuth() {
  const params = new URLSearchParams(location.search);
  const invite = params.get('invite') || '';
  let tab = invite ? 'student' : 'login';
  app.innerHTML = `<div class="auth-wrap">
    <section class="auth-hero">
      <div class="brand" style="padding:0 0 24px"><span class="logo" style="background:rgba(255,255,255,.2)">🎓</span> Подготовка к ОГЭ и ЕГЭ</div>
      <h1>Занятия, домашние задания и тесты — в одном месте</h1>
      <p style="opacity:.9;font-size:1.05rem">Репетитор задаёт ДЗ и тесты, ученик выполняет и сразу видит баллы и оценку.</p>
      <ul><li>📚 Домашние задания с файлами и проверкой</li><li>📝 Тесты с автоматическим подсчётом баллов</li>
      <li>🔑 Ученики присоединяются по ключу приглашения</li><li>🎨 Оформление под сезон или любимый цвет</li></ul>
    </section>
    <section class="auth-form"><div class="card">
      <div class="tabs" style="width:100%;margin-bottom:18px">
        <button data-tab="login" style="flex:1">Вход</button><button data-tab="tutor" style="flex:1">Я репетитор</button><button data-tab="student" style="flex:1">Я ученик</button>
      </div>
      <form id="authForm"></form>
    </div></section></div>`;
  const form = $('#authForm');
  const draw = () => {
    $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const common = `<label class="f"><span>Email</span><input type="email" name="email" required autocomplete="email"></label>
      <label class="f"><span>Пароль</span><input type="password" name="password" required minlength="${tab === 'login' ? 1 : 6}" autocomplete="${tab === 'login' ? 'current-password' : 'new-password'}"></label>`;
    if (tab === 'login') form.innerHTML = `<h2>С возвращением!</h2>${common}<button class="btn block">Войти</button>`;
    if (tab === 'tutor') form.innerHTML = `<h2>Регистрация репетитора</h2><p class="muted small">Создайте кабинет и приглашайте учеников по ключу.</p>
      <label class="f"><span>Имя и фамилия</span><input type="text" name="name" required></label>${common}<button class="btn block">Создать кабинет</button>`;
    if (tab === 'student') form.innerHTML = `<h2>Регистрация ученика</h2><p class="muted small">Ключ приглашения выдаёт ваш репетитор.</p>
      <label class="f"><span>Ключ приглашения</span><input type="text" name="code" required placeholder="ABCD-1234" value="${esc(invite)}" style="text-transform:uppercase;letter-spacing:.08em;font-weight:700"></label>
      <div id="invInfo" class="small" style="margin:-6px 0 10px"></div>
      <label class="f"><span>Имя и фамилия</span><input type="text" name="name" required></label>${common}<button class="btn block">Присоединиться</button>`;
    const code = form.elements.code;
    if (code) {
      const check = async () => {
        const v = code.value.trim(); const info = $('#invInfo');
        if (v.length < 9) { info.textContent = ''; return; }
        try { const r = await api('/api/invite-info/' + encodeURIComponent(v)); info.innerHTML = `✅ Репетитор: <b>${esc(r.tutor_name)}</b>${r.exam ? ' · ' + esc(r.exam) : ''}`; info.style.color = 'var(--ok)'; }
        catch { info.textContent = '✕ Ключ не найден'; info.style.color = 'var(--danger)'; }
      };
      code.oninput = check; check();
    }
  };
  $$('.tabs button').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; draw(); }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    const url = { login: '/api/login', tutor: '/api/register-tutor', student: '/api/register-student' }[tab];
    try {
      const r = await api(url, { method: 'POST', body });
      ME = r.user;
      if (!ME.theme) { ME.theme = getTheme(); api('/api/me/theme', { method: 'PUT', body: ME.theme }).catch(() => {}); }
      history.replaceState(null, '', '/#/');
      applyTheme(); render();
    } catch (err) { fail(err); }
  };
  draw();
}

// ================= каркас =================
function navItems() {
  const t = isTutor();
  return [
    ['#/', '🏠', 'Главная'],
    ['#/homework', '📚', 'Домашние задания'],
    ['#/tests', '📝', 'Тесты'],
    ['#/results', '📈', t ? 'Результаты' : 'Мои результаты'],
    ['#/materials', '📁', 'Материалы'],
    ...(t ? [['#/students', '👥', 'Ученики'], ['#/invites', '🔑', 'Приглашения']] : []),
    ['#/appearance', '🎨', 'Оформление'],
  ];
}
function shell(content) {
  const hash = location.hash || '#/';
  const items = navItems().map(([href, ic, label]) => {
    const active = href === '#/' ? hash === '#/' || hash === '' : hash.startsWith(href);
    return `<a href="${href}" class="${active ? 'active' : ''}"><span class="ic">${ic}</span>${label}</a>`;
  }).join('');
  app.innerHTML = `<div class="shell" id="shell">
    <aside class="sidebar">
      <div class="brand"><span class="logo">🎓</span><span>ОГЭ · ЕГЭ</span></div>
      <nav class="nav">${items}</nav>
      <div class="me"><b>${esc(ME.name)}</b><div class="muted small">${isTutor() ? 'Репетитор' : 'Ученик' + (ME.tutor_name ? ' · ' + esc(ME.tutor_name) : '')}</div>
        <button class="btn ghost sm" id="logout" style="padding-left:0;margin-top:6px">Выйти</button></div>
    </aside>
    <div>
      <div class="topbar"><button class="btn secondary sm" id="burger" aria-label="Меню">☰</button><b>🎓 ОГЭ · ЕГЭ</b></div>
      <main class="main" id="main">${content}</main>
    </div></div>`;
  $('#logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); ME = null; location.hash = ''; render(); };
  $('#burger').onclick = () => $('#shell').classList.toggle('nav-open');
  $('#shell').addEventListener('click', (e) => { if (e.target.closest('.nav a')) $('#shell').classList.remove('nav-open'); });
  return $('#main');
}
const loading = () => shell('<div class="empty">Загрузка…</div>');
const empty = (ic, text, extra = '') => `<div class="card empty"><div class="ic">${ic}</div><div>${text}</div>${extra}</div>`;

// ================= страницы =================
const routes = [
  [/^#?\/?$/, pageDashboard],
  [/^#\/homework$/, pageHomework],
  [/^#\/homework\/new$/, pageHomeworkNew],
  [/^#\/homework\/(\d+)$/, pageHomeworkView],
  [/^#\/tests$/, pageTests],
  [/^#\/tests\/new$/, (m) => pageTestEdit(null)],
  [/^#\/tests\/(\d+)\/edit$/, (m) => pageTestEdit(m[1])],
  [/^#\/tests\/(\d+)\/take$/, pageTestTake],
  [/^#\/tests\/(\d+)\/results$/, pageTestResults],
  [/^#\/attempt\/(\d+)$/, pageAttempt],
  [/^#\/results$/, pageResults],
  [/^#\/materials$/, pageMaterials],
  [/^#\/students$/, pageStudents],
  [/^#\/invites$/, pageInvites],
  [/^#\/appearance$/, pageAppearance],
];
let leaveGuard = null;
async function render() {
  if (leaveGuard) { leaveGuard(); leaveGuard = null; }
  if (!ME) return renderAuth();
  const hash = location.hash || '#/';
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) { try { await fn(m); } catch (e) { shell(empty('⚠️', esc(e.message))); } window.scrollTo(0, 0); return; }
  }
  shell(empty('🤷', 'Страница не найдена'));
}
window.addEventListener('hashchange', render);

// ---------- главная ----------
async function pageDashboard() {
  loading();
  const greeting = (() => { const h = new Date().getHours(); return h < 6 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'; })();
  if (isTutor()) {
    const [d, hw, res] = await Promise.all([api('/api/dashboard'), api('/api/homework'), api('/api/my-results')]);
    const main = shell(`<div class="page-head"><h1>${greeting}, ${esc(ME.name.split(' ')[0])}!</h1>
      <div class="row"><a class="btn secondary" href="#/tests/new">+ Тест</a><a class="btn" href="#/homework/new">+ Домашнее задание</a></div></div>
      <div class="grid g4 stats">
        <div class="card stat"><div class="v">${d.students}</div><div class="l">учеников</div></div>
        <div class="card stat"><div class="v">${d.to_review}</div><div class="l">работ ждут проверки</div></div>
        <div class="card stat"><div class="v">${d.tests}</div><div class="l">тестов</div></div>
        <div class="card stat"><div class="v">${d.avg_percent ?? '—'}${d.avg_percent != null ? '%' : ''}</div><div class="l">средний результат тестов</div></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h2>Нужно проверить</h2>${hw.filter((h) => h.to_review).slice(0, 6).map((h) => `
          <a class="list-item" href="#/homework/${h.id}"><div class="grow"><div class="title">${esc(h.title)}</div><div class="muted small">${esc(h.subject)}</div></div>
          <span class="badge warn">${h.to_review}</span></a>`).join('') || '<p class="muted">Все работы проверены 🎉</p>'}</div>
        <div class="card"><h2>Последние результаты тестов</h2>${res.slice(0, 6).map((r) => `
          <a class="list-item" href="#/attempt/${r.id}">${gradeBadge(r.grade)}<div class="grow"><div class="title">${esc(r.student_name)}</div>
          <div class="muted small">${esc(r.title)} · ${fmtDateTime(r.finished_at)}</div></div><b>${r.score}/${r.max_score}</b></a>`).join('') || '<p class="muted">Пока никто не проходил тесты.</p>'}</div>
      </div>
      ${d.students === 0 ? `<div class="card" style="margin-top:16px"><h2>С чего начать</h2><p>1. Создайте <a href="#/invites">ключ приглашения</a> и отправьте его ученику.<br>2. Задайте <a href="#/homework/new">домашнее задание</a> или <a href="#/tests/new">тест</a>.<br>3. Настройте <a href="#/appearance">оформление</a> под себя.</p></div>` : ''}`);
    return main;
  }
  const [d, hw, tests] = await Promise.all([api('/api/dashboard'), api('/api/homework'), api('/api/tests')]);
  const todo = hw.filter((h) => !h.my_status || h.my_status === 'returned');
  shell(`<div class="page-head"><h1>${greeting}, ${esc(ME.name.split(' ')[0])}!</h1>${ME.exam ? `<span class="badge">Готовлюсь к ${esc(ME.exam)}</span>` : ''}</div>
    <div class="grid g4 stats">
      <div class="card stat"><div class="v">${todo.length}</div><div class="l">заданий к выполнению</div></div>
      <div class="card stat"><div class="v">${d.attempts}</div><div class="l">тестов пройдено</div></div>
      <div class="card stat"><div class="v">${d.avg_percent ?? '—'}${d.avg_percent != null ? '%' : ''}</div><div class="l">средний результат</div></div>
      <div class="card stat"><div class="v">${d.avg_grade ?? '—'}</div><div class="l">средняя оценка</div></div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Домашние задания</h2>${todo.slice(0, 6).map(hwItem).join('') || '<p class="muted">Все задания сданы 🎉</p>'}</div>
      <div class="card"><h2>Новые тесты</h2>${tests.filter((t) => !t.my_attempts).slice(0, 6).map(testItemStudent).join('') || '<p class="muted">Новых тестов нет.</p>'}</div>
    </div>`);
}

// ---------- домашние задания ----------
function hwStatus(h) {
  if (h.my_status === 'reviewed') return `<span class="badge ok">Проверено</span>${gradeBadge(h.my_grade)}`;
  if (h.my_status === 'submitted') return '<span class="badge">Сдано</span>';
  if (h.my_status === 'returned') return '<span class="badge warn">На доработку</span>';
  if (h.due_date && new Date(h.due_date) < new Date(new Date().toDateString())) return '<span class="badge danger">Просрочено</span>';
  return '<span class="badge gray">Не сдано</span>';
}
function hwItem(h) {
  return `<a class="list-item" href="#/homework/${h.id}"><div class="grow"><div class="title">${esc(h.title)}</div>
    <div class="muted small">${esc(h.subject || '')}${h.due_date ? ' · до ' + fmtDate(h.due_date) : ''}</div></div>
    ${isTutor() ? `${h.to_review ? `<span class="badge warn">${h.to_review} на проверку</span>` : ''}<span class="badge gray">${h.submitted}/${h.target_count} сдали</span>` : hwStatus(h)}</a>`;
}
async function pageHomework() {
  loading();
  const list = await api('/api/homework');
  shell(`<div class="page-head"><h1>Домашние задания</h1>${isTutor() ? '<a class="btn" href="#/homework/new">+ Новое задание</a>' : ''}</div>
    ${list.length ? `<div>${list.map(hwItem).join('')}</div>` : empty('📚', isTutor() ? 'Заданий пока нет' : 'Репетитор ещё не задал домашних заданий',
      isTutor() ? '<a class="btn" href="#/homework/new" style="margin-top:12px">Создать первое задание</a>' : '')}`);
}
async function pageHomeworkNew() {
  if (!isTutor()) return (location.hash = '#/homework');
  loading();
  const students = await api('/api/students');
  const main = shell(`<div class="page-head"><h1>Новое домашнее задание</h1></div>
    <form class="card" id="hwForm">
      <label class="f"><span>Название</span><input type="text" name="title" required placeholder="Например: Задания 1–5, вариант 12"></label>
      <div class="grid g2">
        <label class="f"><span>Предмет</span><select name="subject">${SUBJECTS.map((s) => `<option>${s}</option>`).join('')}</select></label>
        <label class="f"><span>Срок сдачи</span><input type="date" name="due_date"></label>
      </div>
      <label class="f"><span>Описание задания</span><textarea name="description" rows="6" placeholder="Что нужно сделать, ссылки, комментарии…"></textarea></label>
      <div class="f"><b class="small">Файлы к заданию</b><div id="up" style="margin-top:6px"></div></div>
      <div class="f" style="margin-top:14px"><b class="small">Кому задать</b>
        ${students.length ? `<div class="row" style="margin:8px 0"><label class="check"><input type="checkbox" id="allSt" checked> Всем ученикам</label></div>
        <div id="stList" class="grid g3" style="display:none">${students.map((s) => `<label class="check"><input type="checkbox" name="st" value="${s.id}"> ${esc(s.name)} ${examBadge(s.exam)}</label>`).join('')}</div>`
        : '<p class="muted small">Учеников пока нет — задание увидят все, кто присоединится.</p>'}
      </div>
      <div class="row" style="margin-top:16px"><button class="btn">Задать</button><a class="btn secondary" href="#/homework">Отмена</a></div>
    </form>`);
  const up = mountUploader($('#up', main));
  const all = $('#allSt');
  if (all) all.onchange = () => ($('#stList').style.display = all.checked ? 'none' : 'grid');
  $('#hwForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      title: f.title.value, subject: f.subject.value, due_date: f.due_date.value, description: f.description.value,
      file_ids: up.files.map((x) => x.id),
      student_ids: all && !all.checked ? $$('input[name=st]:checked').map((c) => +c.value) : [],
    };
    if (all && !all.checked && !body.student_ids.length) return toast('Выберите хотя бы одного ученика', true);
    try { const r = await api('/api/homework', { method: 'POST', body }); toast('Задание создано'); location.hash = '#/homework/' + r.id; } catch (err) { fail(err); }
  };
}
async function pageHomeworkView(m) {
  loading();
  const hw = await api('/api/homework/' + m[1]);
  const head = `<div class="page-head"><div><a href="#/homework" class="small">← Все задания</a><h1 style="margin-top:6px">${esc(hw.title)}</h1>
    <div class="muted">${esc(hw.subject || '')}${hw.due_date ? ' · срок: ' + fmtDate(hw.due_date) : ''}</div></div>
    ${isTutor() ? '<button class="btn danger" id="del">Удалить</button>' : ''}</div>
    <div class="card"><div style="white-space:pre-wrap">${esc(hw.description) || '<span class="muted">Без описания</span>'}</div>
    ${hw.files.length ? `<h3 style="margin-top:16px">Файлы</h3><div class="files">${hw.files.map((f) => fileChip(f)).join('')}</div>` : ''}</div>`;

  if (isTutor()) {
    const main = shell(head + `<h2 style="margin-top:24px">Работы учеников</h2>
      ${hw.students.length ? hw.students.map((s) => {
        const sub = s.submission;
        return `<div class="card"><div class="row"><b>${esc(s.name)}</b><span class="spacer"></span>
          ${!sub ? '<span class="badge gray">Не сдано</span>' : sub.status === 'reviewed' ? `<span class="badge ok">Проверено</span>${gradeBadge(sub.grade)}` : sub.status === 'returned' ? '<span class="badge warn">На доработке</span>' : `<span class="badge">Сдано ${fmtDateTime(sub.updated_at)}</span>`}</div>
          ${sub ? `<div style="white-space:pre-wrap;margin-top:10px">${esc(sub.text) || '<span class="muted">Без текста</span>'}</div>
          ${sub.files.length ? `<div class="files" style="margin-top:10px">${sub.files.map((f) => fileChip(f)).join('')}</div>` : ''}
          <form class="review" data-id="${sub.id}" style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px">
            <div class="row" style="align-items:flex-end">
              <label class="f" style="margin:0"><span>Оценка</span><select name="grade" style="width:110px"><option value="">—</option>${[5, 4, 3, 2].map((g) => `<option ${sub.grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
              <label class="f" style="margin:0;flex:1;min-width:200px"><span>Комментарий</span><input type="text" name="comment" value="${esc(sub.comment || '')}"></label>
              <button class="btn" name="st" value="reviewed">Сохранить</button><button class="btn secondary" name="st" value="returned">На доработку</button>
            </div></form>` : ''}</div>`;
      }).join('') : empty('👥', 'Нет учеников, которым назначено задание')}`);
    $('#del').onclick = async () => { if (await confirmBox('Удалить задание и все сданные работы?')) { await api('/api/homework/' + hw.id, { method: 'DELETE' }); location.hash = '#/homework'; } };
    $$('form.review', main).forEach((f) => (f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(`/api/submissions/${f.dataset.id}/review`, { method: 'PUT', body: { grade: f.grade.value, comment: f.comment.value, status: e.submitter.value } });
        toast('Сохранено'); render();
      } catch (err) { fail(err); }
    }));
    return;
  }
  const sub = hw.submission;
  const locked = sub && sub.status === 'reviewed';
  const main = shell(head + `<div class="card"><h2>Моё решение</h2>
    ${sub ? `<div class="row" style="margin-bottom:10px">${sub.status === 'reviewed' ? `<span class="badge ok">Проверено</span>${gradeBadge(sub.grade)}` : sub.status === 'returned' ? '<span class="badge warn">Отправлено на доработку</span>' : `<span class="badge">Сдано ${fmtDateTime(sub.updated_at)}</span>`}</div>
      ${sub.comment ? `<div class="card" style="background:var(--accent-soft);box-shadow:none;margin-bottom:12px"><b>Комментарий репетитора:</b> ${esc(sub.comment)}</div>` : ''}
      ${sub.files.length ? `<div class="files" style="margin-bottom:12px">${sub.files.map((f) => fileChip(f)).join('')}</div>` : ''}` : ''}
    ${locked ? `<div style="white-space:pre-wrap">${esc(sub.text)}</div>` : `<form id="subForm">
      <label class="f"><span>Ответ</span><textarea name="text" rows="6" placeholder="Напишите ответы или комментарий к решению">${esc(sub ? sub.text : '')}</textarea></label>
      <div class="f"><b class="small">Прикрепить файлы (фото решения, документ)</b><div id="up" style="margin-top:6px"></div></div>
      <button class="btn">${sub ? 'Отправить заново' : 'Сдать работу'}</button></form>`}</div>`);
  if (!locked) {
    const up = mountUploader($('#up', main));
    $('#subForm').onsubmit = async (e) => {
      e.preventDefault();
      if (!e.target.text.value.trim() && !up.files.length && !(sub && sub.files.length)) return toast('Добавьте ответ или файл', true);
      try { await api(`/api/homework/${hw.id}/submit`, { method: 'POST', body: { text: e.target.text.value, file_ids: up.files.map((f) => f.id) } }); toast('Работа отправлена'); render(); } catch (err) { fail(err); }
    };
  }
}

// ---------- тесты ----------
function testItemStudent(t) {
  const left = t.max_attempts ? t.max_attempts - t.my_attempts : null;
  return `<div class="list-item"><div class="grow"><div class="title">${esc(t.title)} ${examBadge(t.exam)}</div>
    <div class="muted small">${esc(t.subject || '')} · ${plural(t.question_count, 'вопрос', 'вопроса', 'вопросов')} · ${t.max_score} б.${t.time_limit ? ' · ' + t.time_limit + ' мин' : ''}</div></div>
    ${t.my_last ? `<a href="#/attempt/${t.my_last.id}" class="row" style="text-decoration:none;color:inherit;gap:6px">${gradeBadge(t.my_last.grade)}<span class="small"><b>${t.my_last.score}/${t.my_last.max_score}</b></span></a>` : ''}
    ${left === 0 ? '<span class="badge gray">Попытки исчерпаны</span>' : `<a class="btn sm" href="#/tests/${t.id}/take">${t.my_attempts ? 'Пройти ещё' : 'Начать'}</a>`}</div>`;
}
async function pageTests() {
  loading();
  const list = await api('/api/tests');
  if (!isTutor()) return shell(`<div class="page-head"><h1>Тесты</h1></div>${list.length ? list.map(testItemStudent).join('') : empty('📝', 'Тестов пока нет')}`);
  shell(`<div class="page-head"><h1>Тесты</h1><a class="btn" href="#/tests/new">+ Новый тест</a></div>
    ${list.length ? list.map((t) => `<div class="list-item"><div class="grow"><div class="title">${esc(t.title)} ${examBadge(t.exam)} ${t.published ? '' : '<span class="badge gray">Черновик</span>'}</div>
      <div class="muted small">${esc(t.subject || '')} · ${plural(t.question_count, 'вопрос', 'вопроса', 'вопросов')} · ${t.max_score} б. · ${plural(t.attempts_count, 'попытка', 'попытки', 'попыток')}${t.avg_percent != null ? ' · средний ' + t.avg_percent + '%' : ''}</div></div>
      <a class="btn secondary sm" href="#/tests/${t.id}/results">Результаты</a><a class="btn secondary sm" href="#/tests/${t.id}/edit">Изменить</a></div>`).join('')
    : empty('📝', 'Тестов пока нет', '<a class="btn" href="#/tests/new" style="margin-top:12px">Создать тест</a>')}`);
}

function newQuestion(type = 'single') {
  return { type, text: '', options: type === 'text' ? [] : ['', '', '', ''], correct: type === 'multiple' ? [] : type === 'text' ? '' : 0, points: 1, partial: false, explanation: '' };
}
async function pageTestEdit(id) {
  if (!isTutor()) return (location.hash = '#/tests');
  loading();
  const t = id ? await api('/api/tests/' + id) : {
    title: '', description: '', subject: SUBJECTS[0], exam: 'ЕГЭ', time_limit: 0, max_attempts: 0, show_answers: 1, published: 1,
    scale: { 5: 85, 4: 65, 3: 45 }, questions: [newQuestion()],
  };
  const st = JSON.parse(JSON.stringify(t));
  const main = shell(`<div class="page-head"><div><a href="#/tests" class="small">← Тесты</a><h1 style="margin-top:6px">${id ? 'Редактирование теста' : 'Новый тест'}</h1></div>
    ${id ? '<button class="btn danger" id="del">Удалить тест</button>' : ''}</div>
    <div class="card">
      <label class="f"><span>Название</span><input type="text" id="tTitle" value="${esc(st.title)}" placeholder="Пробник ЕГЭ по математике, часть 1"></label>
      <div class="grid g3">
        <label class="f"><span>Предмет</span><select id="tSubj">${SUBJECTS.map((s) => `<option ${s === st.subject ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="f"><span>Экзамен</span><select id="tExam">${[['ЕГЭ', 'ЕГЭ'], ['ОГЭ', 'ОГЭ'], ['any', 'Для всех']].map(([v, l]) => `<option value="${v}" ${v === st.exam ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f"><span>Время, мин (0 — без ограничения)</span><input type="number" min="0" id="tTime" value="${st.time_limit}"></label>
      </div>
      <label class="f"><span>Описание / инструкция</span><textarea id="tDesc" rows="2">${esc(st.description)}</textarea></label>
      <div class="grid g2">
        <div><b class="small">Шкала оценок (процент от максимума)</b>
          <div class="row" style="margin-top:6px">${[5, 4, 3].map((g) => `<label class="row small" style="gap:6px">${gradeBadge(g)} от <input type="number" min="0" max="100" data-scale="${g}" value="${st.scale[g]}" style="width:72px">%</label>`).join('')}</div>
          <div class="muted small" style="margin-top:4px">Ниже порога «3» — оценка 2.</div></div>
        <div class="stack">
          <label class="f" style="margin:0"><span>Количество попыток (0 — без ограничения)</span><input type="number" min="0" id="tAtt" value="${st.max_attempts}"></label>
          <label class="check"><input type="checkbox" id="tShow" ${st.show_answers ? 'checked' : ''}> Показывать ученику правильные ответы после теста</label>
          <label class="check"><input type="checkbox" id="tPub" ${st.published ? 'checked' : ''}> Опубликован (виден ученикам)</label>
        </div>
      </div>
    </div>
    <div class="page-head" style="margin-top:24px"><h2 style="margin:0">Вопросы</h2><span class="muted" id="maxScore"></span></div>
    <div id="qs"></div>
    <div class="row" style="margin-top:12px"><button class="btn secondary" data-add="single">+ Один ответ</button><button class="btn secondary" data-add="multiple">+ Несколько ответов</button><button class="btn secondary" data-add="text">+ Краткий ответ</button></div>
    <div class="row" style="margin-top:24px"><button class="btn" id="save">Сохранить тест</button><a class="btn secondary" href="#/tests">Отмена</a></div>`);

  const qsBox = $('#qs', main);
  const drawQs = () => {
    qsBox.innerHTML = st.questions.map((q, i) => `<div class="builder-q" data-i="${i}">
      <div class="row"><span class="q-num">№${i + 1}</span>
        <select data-k="type" style="width:auto"><option value="single" ${q.type === 'single' ? 'selected' : ''}>Один верный ответ</option><option value="multiple" ${q.type === 'multiple' ? 'selected' : ''}>Несколько верных</option><option value="text" ${q.type === 'text' ? 'selected' : ''}>Краткий ответ (число/слово)</option></select>
        <label class="row small" style="gap:6px">Баллы <input type="number" min="1" data-k="points" value="${q.points}" style="width:70px"></label>
        <span class="spacer"></span>
        <button class="btn ghost sm" data-mv="-1" ${i === 0 ? 'disabled' : ''} aria-label="Выше">↑</button><button class="btn ghost sm" data-mv="1" ${i === st.questions.length - 1 ? 'disabled' : ''} aria-label="Ниже">↓</button>
        <button class="btn danger sm" data-rmq>Удалить</button></div>
      <textarea data-k="text" rows="2" style="margin-top:10px" placeholder="Текст вопроса">${esc(q.text)}</textarea>
      ${q.type === 'text' ? `<label class="f" style="margin-top:10px"><span>Правильный ответ (несколько вариантов — через «;»)</span><input type="text" data-k="correct" value="${esc(q.correct)}" placeholder="например: 0,5; 1/2"></label>
        <div class="muted small" style="margin-top:-6px">Регистр, пробелы, «ё/е» и «,/.» не учитываются.</div>`
      : `<div class="small muted" style="margin-top:10px">Варианты ответа — отметьте ${q.type === 'single' ? 'верный' : 'все верные'}:</div>
        ${q.options.map((o, j) => `<div class="opt-edit"><input type="${q.type === 'single' ? 'radio' : 'checkbox'}" name="c${i}" data-correct="${j}" ${q.type === 'single' ? (q.correct === j ? 'checked' : '') : (q.correct.includes(j) ? 'checked' : '')} aria-label="Верный">
          <input type="text" data-opt="${j}" value="${esc(o)}" placeholder="Вариант ${j + 1}"><button class="btn ghost sm" data-rmo="${j}" aria-label="Удалить вариант">✕</button></div>`).join('')}
        <button class="btn ghost sm" data-addo style="margin-top:4px">+ вариант</button>
        ${q.type === 'multiple' && q.points > 1 ? `<label class="check small" style="margin-top:6px"><input type="checkbox" data-k="partial" ${q.partial ? 'checked' : ''}> За одну ошибку — на 1 балл меньше (как в ЕГЭ)</label>` : ''}`}
      <input type="text" data-k="explanation" value="${esc(q.explanation)}" placeholder="Пояснение к ответу (необязательно)" style="margin-top:10px">
    </div>`).join('') || '<p class="muted">Добавьте вопросы кнопками ниже.</p>';
    $('#maxScore').textContent = 'Максимум: ' + st.questions.reduce((s, q) => s + (+q.points || 1), 0) + ' б.';
  };
  drawQs();
  qsBox.addEventListener('input', (e) => {
    const box = e.target.closest('.builder-q'); if (!box) return;
    const q = st.questions[+box.dataset.i]; const el = e.target;
    if (el.dataset.k === 'type') {
      const nq = newQuestion(el.value); nq.text = q.text; nq.points = q.points; nq.explanation = q.explanation;
      if (el.value !== 'text' && q.options.length) nq.options = q.options;
      st.questions[+box.dataset.i] = nq; drawQs();
    } else if (el.dataset.k === 'points') { q.points = +el.value || 1; $('#maxScore').textContent = 'Максимум: ' + st.questions.reduce((s, x) => s + (+x.points || 1), 0) + ' б.'; if (q.type === 'multiple') drawQsKeepFocus(el); }
    else if (el.dataset.k === 'partial') q.partial = el.checked;
    else if (el.dataset.k) q[el.dataset.k] = el.value;
    else if (el.dataset.opt !== undefined) q.options[+el.dataset.opt] = el.value;
    else if (el.dataset.correct !== undefined) {
      const j = +el.dataset.correct;
      if (q.type === 'single') q.correct = j; else q.correct = el.checked ? [...new Set([...q.correct, j])] : q.correct.filter((x) => x !== j);
    }
  });
  const drawQsKeepFocus = (el) => { const i = el.closest('.builder-q').dataset.i; drawQs(); const n = $(`.builder-q[data-i="${i}"] [data-k=points]`); n && n.focus(); };
  qsBox.addEventListener('click', (e) => {
    const box = e.target.closest('.builder-q'); if (!box) return;
    const i = +box.dataset.i; const q = st.questions[i]; const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-rmq')) st.questions.splice(i, 1);
    else if (b.dataset.mv) { const j = i + +b.dataset.mv; [st.questions[i], st.questions[j]] = [st.questions[j], st.questions[i]]; }
    else if (b.hasAttribute('data-addo')) q.options.push('');
    else if (b.dataset.rmo !== undefined) {
      const j = +b.dataset.rmo; q.options.splice(j, 1);
      if (q.type === 'single') q.correct = q.correct === j ? 0 : q.correct > j ? q.correct - 1 : q.correct;
      else q.correct = q.correct.filter((x) => x !== j).map((x) => (x > j ? x - 1 : x));
    } else return;
    drawQs();
  });
  $$('[data-add]', main).forEach((b) => (b.onclick = () => { st.questions.push(newQuestion(b.dataset.add)); drawQs(); $$('.builder-q').pop().scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
  if (id) $('#del').onclick = async () => { if (await confirmBox('Удалить тест вместе со всеми результатами?')) { await api('/api/tests/' + id, { method: 'DELETE' }); location.hash = '#/tests'; } };
  $('#save').onclick = async () => {
    const body = {
      title: $('#tTitle').value.trim(), subject: $('#tSubj').value, exam: $('#tExam').value, time_limit: +$('#tTime').value || 0,
      description: $('#tDesc').value, max_attempts: +$('#tAtt').value || 0, show_answers: $('#tShow').checked, published: $('#tPub').checked,
      scale: Object.fromEntries($$('[data-scale]').map((x) => [x.dataset.scale, +x.value])), questions: st.questions,
    };
    if (!body.title) return toast('Укажите название теста', true);
    for (const [i, q] of body.questions.entries()) {
      if (!q.text.trim()) return toast(`Вопрос №${i + 1}: нет текста`, true);
      if (q.type === 'text' && !String(q.correct).trim()) return toast(`Вопрос №${i + 1}: укажите правильный ответ`, true);
      if (q.type !== 'text' && q.options.filter((o) => o.trim()).length < 2) return toast(`Вопрос №${i + 1}: нужно минимум 2 варианта`, true);
      if (q.type === 'multiple' && !q.correct.length) return toast(`Вопрос №${i + 1}: отметьте верные варианты`, true);
    }
    if (!(body.scale[5] >= body.scale[4] && body.scale[4] >= body.scale[3])) return toast('Пороги шкалы должны убывать: 5 ≥ 4 ≥ 3', true);
    try { await api(id ? '/api/tests/' + id : '/api/tests', { method: id ? 'PUT' : 'POST', body }); toast('Тест сохранён'); location.hash = '#/tests'; } catch (e) { fail(e); }
  };
}

async function pageTestTake(m) {
  loading();
  const t = await api('/api/tests/' + m[1]);
  if (t.max_attempts && t.my_attempts >= t.max_attempts) return shell(empty('⛔', 'Попытки для этого теста закончились'));
  const answers = {};
  let started = false;
  const main = shell(`<div class="page-head"><div><a href="#/tests" class="small">← Тесты</a><h1 style="margin-top:6px">${esc(t.title)}</h1>
    <div class="muted">${esc(t.subject)} · ${plural(t.question_count, 'вопрос', 'вопроса', 'вопросов')} · максимум ${t.max_score} б.${t.time_limit ? ' · ' + t.time_limit + ' мин' : ''}</div></div></div>
    <div id="body"></div>`);
  const body = $('#body', main);
  body.innerHTML = `<div class="card">${t.description ? `<p style="white-space:pre-wrap">${esc(t.description)}</p>` : ''}
    <p class="muted">${t.time_limit ? `На выполнение — ${t.time_limit} мин. По истечении времени ответы отправятся автоматически.` : 'Время не ограничено.'}
    ${t.max_attempts ? `Попытка ${t.my_attempts + 1} из ${t.max_attempts}.` : ''}</p><button class="btn" id="go">Начать тест</button></div>`;
  $('#go').onclick = () => {
    started = true;
    body.innerHTML = `${t.time_limit ? '<div class="card timer row" style="padding:10px 16px"><b>⏱ Осталось:</b><span id="tm" style="font-variant-numeric:tabular-nums;font-weight:800"></span><span class="spacer"></span><span class="muted small" id="answered"></span></div>' : '<div class="muted small" id="answered" style="margin-bottom:8px"></div>'}
      <form id="tf" style="margin-top:12px">${t.questions.map((q, i) => `<div class="q-card"><div class="row" style="margin-bottom:6px"><span class="q-num">Вопрос ${i + 1}</span><span class="spacer"></span><span class="badge gray">${plural(q.points, 'балл', 'балла', 'баллов')}</span></div>
        <div class="q-text">${esc(q.text)}</div>
        ${q.type === 'text' ? `<input type="text" data-q="${q.id}" placeholder="Ваш ответ" autocomplete="off">`
        : (q.type === 'multiple' ? '<div class="muted small">Выберите все верные варианты</div>' : '') + q.options.map((o, j) => o.trim() ? `<label class="opt"><input type="${q.type === 'single' ? 'radio' : 'checkbox'}" name="${q.id}" value="${j}" data-q="${q.id}"> ${esc(o)}</label>` : '').join('')}
      </div>`).join('')}
      <div class="row" style="margin-top:18px"><button class="btn">Завершить и узнать результат</button></div></form>`;
    const form = $('#tf');
    const count = () => { $('#answered').textContent = `Отвечено ${Object.values(answers).filter((v) => (Array.isArray(v) ? v.length : String(v).trim())).length} из ${t.questions.length}`; };
    count();
    form.addEventListener('input', (e) => {
      const el = e.target; const qid = el.dataset.q; if (!qid) return;
      if (el.type === 'radio') answers[qid] = +el.value;
      else if (el.type === 'checkbox') answers[qid] = $$(`input[name="${qid}"]:checked`, form).map((c) => +c.value);
      else answers[qid] = el.value;
      count();
    });
    let timer;
    const submit = async (auto) => {
      clearInterval(timer); started = false;
      try { const r = await api(`/api/tests/${t.id}/attempt`, { method: 'POST', body: { answers } }); if (auto) toast('Время вышло — ответы отправлены'); location.hash = '#/attempt/' + r.id; }
      catch (e) { fail(e); started = true; }
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const left = t.questions.length - Object.values(answers).filter((v) => (Array.isArray(v) ? v.length : String(v).trim())).length;
      if (left > 0) {
        modal(`<h2>Завершить тест?</h2><p>Без ответа: ${plural(left, 'вопрос', 'вопроса', 'вопросов')}.</p><div class="row" style="justify-content:flex-end"><button class="btn secondary" data-close>Вернуться</button><button class="btn" id="fin">Завершить</button></div>`,
          (mm, close) => ($('#fin', mm).onclick = () => { close(); submit(); }));
      } else submit();
    };
    if (t.time_limit) {
      const end = Date.now() + t.time_limit * 60000;
      const tick = () => {
        const s = Math.max(0, Math.round((end - Date.now()) / 1000));
        const el = $('#tm'); if (!el) return clearInterval(timer);
        el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        el.style.color = s < 60 ? 'var(--danger)' : '';
        if (s === 0) submit(true);
      };
      tick(); timer = setInterval(tick, 1000);
    }
    const before = (e) => { if (started) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', before);
    leaveGuard = () => { clearInterval(timer); window.removeEventListener('beforeunload', before); };
  };
}

function answerText(q, a) {
  if (a === null || a === undefined || (Array.isArray(a) && !a.length) || a === '') return '<span class="muted">нет ответа</span>';
  if (q.type === 'text') return esc(a);
  return (Array.isArray(a) ? a : [a]).map((j) => esc(q.options[j] ?? '?')).join(', ');
}
async function pageAttempt(m) {
  loading();
  const a = await api('/api/attempts/' + m[1]);
  const right = a.review.filter((q) => q.got === q.points).length;
  const words = { 5: 'Отлично!', 4: 'Хорошо!', 3: 'Удовлетворительно', 2: 'Нужно подтянуть' };
  shell(`<div class="page-head"><div><a href="${isTutor() ? `#/tests/${a.test_id}/results` : '#/tests'}" class="small">← Назад</a><h1 style="margin-top:6px">${esc(a.title)}</h1>
    <div class="muted">${isTutor() ? esc(a.student_name) + ' · ' : ''}${fmtDateTime(a.finished_at)}</div></div></div>
    <div class="card result-hero">${gradeBadge(a.grade, true)}
      <div style="flex:1;min-width:220px"><div class="muted">${words[a.grade]}</div><div class="score">${a.score} из ${a.max_score} баллов</div>
        <div class="progress" style="margin:8px 0"><div style="width:${a.percent}%"></div></div>
        <div class="muted small">${a.percent}% · верно ${right} из ${a.review.length} · шкала: «5» от ${a.scale[5]}%, «4» от ${a.scale[4]}%, «3» от ${a.scale[3]}%</div></div>
      ${!isTutor() ? `<a class="btn secondary" href="#/tests/${a.test_id}/take">Пройти ещё раз</a>` : ''}</div>
    <h2 style="margin-top:24px">Разбор ответов</h2>
    ${a.review.map((q, i) => {
      const cls = q.got === q.points ? 'ok' : q.got > 0 ? 'part' : 'bad';
      const hasCorrect = q.correct !== undefined;
      let opts = '';
      if (q.type !== 'text') opts = q.options.map((o, j) => {
        if (!o.trim()) return '';
        const chosen = Array.isArray(q.answer) ? q.answer.includes(j) : q.answer === j;
        const isRight = hasCorrect && (Array.isArray(q.correct) ? q.correct.includes(j) : q.correct === j);
        return `<div class="opt ${isRight ? 'right' : chosen ? 'wrong' : ''}" style="cursor:default">${chosen ? '●' : '○'} ${esc(o)} ${isRight ? '<span class="badge ok" style="margin-left:auto">верно</span>' : ''}</div>`;
      }).join('');
      return `<div class="q-card ${cls}"><div class="row"><span class="q-num">Вопрос ${i + 1}</span><span class="spacer"></span><b>${q.got} / ${q.points}</b></div>
        <div class="q-text" style="margin-top:6px">${esc(q.text)}</div>
        ${q.type === 'text' ? `<div>Ответ: <b>${answerText(q, q.answer)}</b>${hasCorrect ? ` · правильно: <b style="color:var(--ok)">${esc(String(q.correct).split(';')[0])}</b>` : ''}</div>` : opts}
        ${q.explanation ? `<div class="muted small" style="margin-top:8px">💡 ${esc(q.explanation)}</div>` : ''}</div>`;
    }).join('')}
    ${!isTutor() && a.review[0] && a.review[0].correct === undefined ? '<p class="muted small" style="margin-top:12px">Репетитор скрыл правильные ответы для этого теста.</p>' : ''}`);
}

async function pageTestResults(m) {
  loading();
  const { test, attempts } = await api(`/api/tests/${m[1]}/results`);
  const best = {};
  attempts.forEach((a) => { if (!best[a.student_id] || a.percent > best[a.student_id].percent) best[a.student_id] = a; });
  const avg = attempts.length ? (attempts.reduce((s, a) => s + a.percent, 0) / attempts.length).toFixed(1) : null;
  const dist = [5, 4, 3, 2].map((g) => [g, attempts.filter((a) => a.grade === g).length]);
  shell(`<div class="page-head"><div><a href="#/tests" class="small">← Тесты</a><h1 style="margin-top:6px">Результаты: ${esc(test.title)}</h1></div>
    <a class="btn secondary" href="#/tests/${test.id}/edit">Изменить тест</a></div>
    <div class="grid g4 stats"><div class="card stat"><div class="v">${attempts.length}</div><div class="l">попыток</div></div>
      <div class="card stat"><div class="v">${Object.keys(best).length}</div><div class="l">учеников прошли</div></div>
      <div class="card stat"><div class="v">${avg ?? '—'}${avg ? '%' : ''}</div><div class="l">средний результат</div></div>
      <div class="card stat"><div class="row" style="gap:8px;margin-top:4px">${dist.map(([g, n]) => `<span class="row" style="gap:4px">${gradeBadge(g)}<b>${n}</b></span>`).join('')}</div><div class="l" style="margin-top:6px">распределение оценок</div></div></div>
    <div class="card" style="margin-top:16px">${attempts.length ? `<div class="table-wrap"><table><thead><tr><th>Ученик</th><th>Дата</th><th class="num">Баллы</th><th class="num">%</th><th>Оценка</th><th></th></tr></thead><tbody>
      ${attempts.map((a) => `<tr><td><b>${esc(a.student_name)}</b></td><td class="muted">${fmtDateTime(a.finished_at)}</td><td class="num">${a.score} / ${a.max_score}</td><td class="num">${a.percent}</td><td>${gradeBadge(a.grade)}</td><td><a href="#/attempt/${a.id}">Разбор →</a></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Пока никто не прошёл этот тест.</p>'}</div>`);
}

async function pageResults() {
  loading();
  const list = await api('/api/my-results');
  shell(`<div class="page-head"><h1>${isTutor() ? 'Результаты учеников' : 'Мои результаты'}</h1></div>
    ${list.length ? `<div class="card"><div class="table-wrap"><table><thead><tr>${isTutor() ? '<th>Ученик</th>' : ''}<th>Тест</th><th>Дата</th><th class="num">Баллы</th><th class="num">%</th><th>Оценка</th><th></th></tr></thead><tbody>
      ${list.map((a) => `<tr>${isTutor() ? `<td><b>${esc(a.student_name)}</b></td>` : ''}<td>${esc(a.title)}</td><td class="muted">${fmtDateTime(a.finished_at)}</td><td class="num">${a.score} / ${a.max_score}</td><td class="num">${a.percent}</td><td>${gradeBadge(a.grade)}</td><td><a href="#/attempt/${a.id}">Разбор →</a></td></tr>`).join('')}
    </tbody></table></div></div>` : empty('📈', 'Результатов пока нет')}`);
}

// ---------- материалы ----------
async function pageMaterials() {
  loading();
  const files = await api('/api/files');
  const tutor = isTutor();
  const main = shell(`<div class="page-head"><h1>Материалы</h1></div>
    <div class="card"><h2>Загрузить файлы</h2>
      ${tutor ? '<label class="check small" style="margin-bottom:10px"><input type="checkbox" id="shared" checked> Открыть доступ ученикам (видно в разделе «Материалы»)</label>' : '<p class="muted small">Ваши файлы видны только вам и репетитору.</p>'}
      <div id="upl"></div></div>
    <div class="card"><h2>${tutor ? 'Все файлы' : 'Файлы'}</h2>
      ${files.length ? `<div class="table-wrap"><table><thead><tr><th>Файл</th><th>Загрузил</th><th>Дата</th><th class="num">Размер</th>${tutor ? '<th>Доступ</th>' : ''}<th></th></tr></thead><tbody>
      ${files.map((f) => `<tr><td>${fileIcon(f.orig_name)} <a href="/api/files/${f.id}/download" target="_blank" rel="noopener"><b>${esc(f.orig_name)}</b></a></td>
        <td class="muted">${esc(f.owner_name)}</td><td class="muted">${fmtDate(f.created_at)}</td><td class="num muted">${fmtSize(f.size)}</td>
        ${tutor ? `<td>${f.owner_id === ME.id ? `<label class="check small"><input type="checkbox" data-share="${f.id}" ${f.shared ? 'checked' : ''}> ученикам</label>` : '<span class="badge gray">от ученика</span>'}</td>` : ''}
        <td>${f.owner_id === ME.id || tutor ? `<button class="btn ghost sm" data-del="${f.id}" aria-label="Удалить">🗑</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">Файлов пока нет.</p>'}</div>`);
  const box = $('#upl', main);
  const mount = () => mountUploader(box, { shared: tutor ? $('#shared').checked : false, onChange: (fs) => fs.length && setTimeout(render, 400) });
  mount();
  if (tutor) $('#shared').onchange = mount;
  main.addEventListener('change', async (e) => { const id = e.target.dataset.share; if (id) { await api('/api/files/' + id, { method: 'PUT', body: { shared: e.target.checked } }); toast(e.target.checked ? 'Файл доступен ученикам' : 'Доступ закрыт'); } });
  main.addEventListener('click', async (e) => {
    const id = e.target.closest('[data-del]')?.dataset.del; if (!id) return;
    if (await confirmBox('Удалить файл? Он пропадёт и из заданий.')) { await api('/api/files/' + id, { method: 'DELETE' }); render(); }
  });
}

// ---------- ученики ----------
async function pageStudents() {
  loading();
  const list = await api('/api/students');
  const main = shell(`<div class="page-head"><h1>Ученики</h1><a class="btn" href="#/invites">🔑 Пригласить ученика</a></div>
    ${list.length ? `<div class="card"><div class="table-wrap"><table><thead><tr><th>Ученик</th><th>Экзамен</th><th class="num">Тестов</th><th class="num">Средний %</th><th class="num">Ср. оценка тестов</th><th class="num">Сдано ДЗ</th><th class="num">Ср. оценка ДЗ</th><th></th></tr></thead><tbody>
      ${list.map((s) => `<tr><td><b>${esc(s.name)}</b><div class="muted small">${esc(s.email)}</div></td>
        <td><select data-exam="${s.id}" style="width:auto;padding:5px 8px">${['', 'ОГЭ', 'ЕГЭ'].map((e) => `<option value="${e}" ${s.exam === e || (!s.exam && !e) ? 'selected' : ''}>${e || '—'}</option>`).join('')}</select></td>
        <td class="num">${s.attempts}</td><td class="num">${s.avg_percent ?? '—'}</td><td class="num">${s.avg_grade ?? '—'}</td><td class="num">${s.submissions}</td><td class="num">${s.avg_hw_grade ?? '—'}</td>
        <td><button class="btn ghost sm" data-del="${s.id}" data-name="${esc(s.name)}" aria-label="Удалить">🗑</button></td></tr>`).join('')}
    </tbody></table></div><p class="muted small" style="margin-top:10px">Экзамен ученика определяет, какие тесты он видит (тесты «Для всех» видны всем).</p></div>`
    : empty('👥', 'Учеников пока нет', '<p>Создайте ключ приглашения и отправьте его ученику.</p><a class="btn" href="#/invites">Создать ключ</a>')}`);
  main.addEventListener('change', async (e) => { const id = e.target.dataset.exam; if (id) { await api('/api/students/' + id, { method: 'PUT', body: { exam: e.target.value } }); toast('Сохранено'); } });
  main.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    if (await confirmBox(`Удалить ученика «${b.dataset.name}» вместе с его работами и результатами?`)) { await api('/api/students/' + b.dataset.del, { method: 'DELETE' }); render(); }
  });
}

// ---------- приглашения ----------
async function pageInvites() {
  loading();
  const list = await api('/api/invites');
  const link = (c) => `${location.origin}/?invite=${c}`;
  const main = shell(`<div class="page-head"><h1>Ключи приглашения</h1></div>
    <form class="card" id="invForm"><h2>Новый ключ</h2>
      <div class="grid g3">
        <label class="f"><span>Для кого (заметка)</span><input type="text" name="note" placeholder="Например: Маша, 11 класс"></label>
        <label class="f"><span>Экзамен ученика</span><select name="exam"><option value="">Не указан</option><option>ЕГЭ</option><option>ОГЭ</option></select></label>
        <label class="f"><span>Сколько раз можно использовать</span><select name="max_uses"><option value="1">1 раз (один ученик)</option><option value="5">5 раз</option><option value="30">30 раз (группа)</option><option value="0">Без ограничений</option></select></label>
      </div><button class="btn">Создать ключ</button></form>
    <div class="card">${list.length ? `<div class="table-wrap"><table><thead><tr><th>Ключ</th><th>Заметка</th><th>Экзамен</th><th class="num">Использован</th><th>Статус</th><th></th></tr></thead><tbody>
      ${list.map((i) => {
        const used = i.max_uses > 0 && i.uses >= i.max_uses;
        return `<tr><td><b style="font-size:1.05rem;letter-spacing:.06em;font-family:ui-monospace,monospace">${i.code}</b></td><td>${esc(i.note) || '<span class="muted">—</span>'}</td><td>${i.exam || '—'}</td>
        <td class="num">${i.uses} / ${i.max_uses || '∞'}</td>
        <td>${used ? '<span class="badge gray">Использован</span>' : i.active ? '<span class="badge ok">Активен</span>' : '<span class="badge gray">Отключён</span>'}</td>
        <td><div class="row" style="flex-wrap:nowrap;gap:4px">${!used && i.active ? `<button class="btn secondary sm" data-copy="${i.code}">Копировать ключ</button><button class="btn secondary sm" data-link="${i.code}">Ссылка</button>` : ''}
          ${!used ? `<button class="btn ghost sm" data-toggle="${i.id}" data-active="${i.active}">${i.active ? 'Отключить' : 'Включить'}</button>` : ''}
          <button class="btn ghost sm" data-del="${i.id}" aria-label="Удалить">🗑</button></div></td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="muted small" style="margin-top:10px">Ученик вводит ключ на странице регистрации («Я ученик») или открывает ссылку — ключ подставится сам.</p>`
      : '<p class="muted">Ключей пока нет.</p>'}</div>`);
  const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); toast(msg); } catch { prompt('Скопируйте:', text); } };
  $('#invForm').onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('/api/invites', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); await render();
      modal(`<h2>Ключ создан</h2><p>Отправьте ученику ключ или ссылку для регистрации:</p>
        <div style="font-size:2rem;font-weight:800;letter-spacing:.1em;text-align:center;padding:14px;background:var(--accent-soft);border-radius:12px;color:var(--accent);font-family:ui-monospace,monospace">${r.code}</div>
        <input type="text" readonly value="${esc(link(r.code))}" style="margin-top:12px" onclick="this.select()">
        <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn secondary" id="cl">Копировать ссылку</button><button class="btn" data-close>Готово</button></div>`,
      (m) => ($('#cl', m).onclick = () => copy(link(r.code), 'Ссылка скопирована')));
    } catch (err) { fail(err); }
  };
  main.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.copy) copy(b.dataset.copy, 'Ключ скопирован');
    if (b.dataset.link) copy(link(b.dataset.link), 'Ссылка скопирована');
    if (b.dataset.toggle) { await api('/api/invites/' + b.dataset.toggle, { method: 'PUT', body: { active: b.dataset.active !== '1' } }); render(); }
    if (b.dataset.del && (await confirmBox('Удалить ключ? Уже зарегистрированные ученики останутся.'))) { await api('/api/invites/' + b.dataset.del, { method: 'DELETE' }); render(); }
  });
}

// ---------- оформление ----------
function pageAppearance() {
  const t = getTheme();
  const save = () => {
    ME.theme = { ...t }; applyTheme(t);
    clearTimeout(save.tm); save.tm = setTimeout(() => api('/api/me/theme', { method: 'PUT', body: t }).then(() => toast('Оформление сохранено')).catch(fail), 400);
  };
  const main = shell(`<div class="page-head"><h1>Оформление</h1></div>
    <div class="card"><h2>Тема по сезону</h2><p class="muted small">Цвета и украшения меняются под время года.</p>
      <div class="grid g3" id="seasons" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
        <button class="theme-card" data-season="auto"><div class="sw" style="background:linear-gradient(90deg,#2f6fdb,#2f9e5a,#e07b0c,#c4501b);color:#fff">🗓️</div><b>Авто</b><span class="muted small">сейчас: ${SEASONS[currentSeason()].name.toLowerCase()}</span></button>
        ${Object.entries(SEASONS).map(([k, s]) => `<button class="theme-card" data-season="${k}"><div class="sw" style="background:linear-gradient(135deg,${s.accent},${s.accent2})">${s.icon}</div><b>${s.name}</b></button>`).join('')}
      </div></div>
    <div class="card"><h2>Свой цвет</h2><p class="muted small">Выберите любой акцентный цвет — остальные оттенки подберутся автоматически.</p>
      <div class="row"><div class="swatches">${PRESETS.map((c) => `<button class="swatch" data-color="${c}" style="background:${c}" aria-label="Цвет ${c}"></button>`).join('')}</div>
        <label class="row small" style="gap:8px;margin-left:8px">или любой: <input type="color" id="picker" value="${t.color}"></label></div></div>
    <div class="card"><h2>Дополнительно</h2>
      <div class="row" style="gap:24px">
        <div><b class="small">Режим</b><div class="tabs" id="dark" style="margin-top:6px"><button data-v="false">☀️ Светлый</button><button data-v="true">🌙 Тёмный</button><button data-v="auto">💻 Как в системе</button></div></div>
        <label class="check" style="margin-top:22px"><input type="checkbox" id="decorToggle" ${t.decor ? 'checked' : ''}> Падающие украшения (снежинки, листья…)</label>
      </div></div>
    <div class="card"><h2>Предпросмотр</h2><div class="row"><button class="btn">Основная кнопка</button><button class="btn secondary">Вторичная</button><span class="badge">Значок</span>${gradeBadge(5)}${gradeBadge(4)}${gradeBadge(3)}</div>
      <div class="progress" style="margin-top:14px"><div style="width:68%"></div></div></div>
    <div class="card"><h2>Смена пароля</h2><form id="pw" class="grid g3" style="align-items:end">
      <label class="f" style="margin:0"><span>Текущий пароль</span><input type="password" name="old_password" required autocomplete="current-password"></label>
      <label class="f" style="margin:0"><span>Новый пароль</span><input type="password" name="new_password" required minlength="6" autocomplete="new-password"></label>
      <button class="btn secondary">Изменить пароль</button></form></div>`);
  const mark = () => {
    $$('[data-season]').forEach((b) => b.classList.toggle('on', t.mode === 'season' && t.season === b.dataset.season));
    $$('[data-color]').forEach((b) => b.classList.toggle('on', t.mode === 'custom' && t.color === b.dataset.color));
    $$('#dark button').forEach((b) => b.classList.toggle('on', String(t.dark) === b.dataset.v));
  };
  mark();
  $$('[data-season]').forEach((b) => (b.onclick = () => { t.mode = 'season'; t.season = b.dataset.season; mark(); save(); }));
  $$('[data-color]').forEach((b) => (b.onclick = () => { t.mode = 'custom'; t.color = b.dataset.color; $('#picker').value = t.color; mark(); save(); }));
  $('#picker').oninput = (e) => { t.mode = 'custom'; t.color = e.target.value; mark(); save(); };
  $$('#dark button').forEach((b) => (b.onclick = () => { t.dark = b.dataset.v === 'auto' ? 'auto' : b.dataset.v === 'true'; mark(); save(); }));
  $('#decorToggle').onchange = (e) => { t.decor = e.target.checked; save(); };
  $('#pw', main).onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/me/password', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); toast('Пароль изменён'); } catch (err) { fail(err); }
  };
}

// ================= старт =================
(async () => {
  applyTheme();
  try { ME = (await api('/api/me')).user; } catch {}
  if (ME) applyTheme();
  render();
})();
