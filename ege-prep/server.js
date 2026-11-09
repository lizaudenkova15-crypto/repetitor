// Сайт подготовки к ОГЭ/ЕГЭ: репетитор, ученики, ДЗ, тесты, файлы, темы.
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL,
  tutor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  exam TEXT, theme TEXT, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY, tutor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE, note TEXT, exam TEXT, max_uses INTEGER DEFAULT 1,
  uses INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tutor_id INTEGER NOT NULL, orig_name TEXT, stored_name TEXT, mime TEXT, size INTEGER,
  shared INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS homework (
  id INTEGER PRIMARY KEY, tutor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT, subject TEXT, due_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS homework_targets (
  homework_id INTEGER REFERENCES homework(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS homework_files (
  homework_id INTEGER REFERENCES homework(id) ON DELETE CASCADE,
  file_id INTEGER REFERENCES files(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY, homework_id INTEGER REFERENCES homework(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE, text TEXT,
  status TEXT DEFAULT 'submitted', grade INTEGER, comment TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(homework_id, student_id)
);
CREATE TABLE IF NOT EXISTS submission_files (
  submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
  file_id INTEGER REFERENCES files(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY, tutor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT, subject TEXT, exam TEXT, time_limit INTEGER DEFAULT 0,
  questions TEXT NOT NULL, scale TEXT NOT NULL, show_answers INTEGER DEFAULT 1,
  max_attempts INTEGER DEFAULT 0, published INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY, test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE, answers TEXT, details TEXT,
  score REAL, max_score REAL, percent REAL, grade INTEGER,
  finished_at TEXT DEFAULT (datetime('now'))
);
`);

const q = (sql) => db.prepare(sql);
const one = (sql, ...a) => q(sql).get(...a);
const all = (sql, ...a) => q(sql).all(...a);
const run = (sql, ...a) => q(sql).run(...a);

// ---------- helpers ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const h = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}
function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return s.slice(0, 4) + '-' + s.slice(4);
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function publicUser(u) {
  if (!u) return null;
  const tutor = u.tutor_id ? one('SELECT name FROM users WHERE id=?', u.tutor_id) : null;
  return {
    id: u.id, role: u.role, name: u.name, email: u.email, exam: u.exam,
    tutor_id: u.tutor_id, tutor_name: tutor ? tutor.name : null,
    theme: u.theme ? JSON.parse(u.theme) : null,
  };
}
const groupOf = (u) => (u.role === 'tutor' ? u.id : u.tutor_id);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions(token,user_id) VALUES(?,?)', token, userId);
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const sid = parseCookies(req).sid;
  if (sid) {
    const s = one('SELECT user_id FROM sessions WHERE token=?', sid);
    if (s) req.user = one('SELECT * FROM users WHERE id=?', s.user_id);
  }
  next();
});
const auth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Нужно войти' }));
const tutorOnly = (req, res, next) =>
  req.user && req.user.role === 'tutor' ? next() : res.status(403).json({ error: 'Только для репетитора' });
const studentOnly = (req, res, next) =>
  req.user && req.user.role === 'student' ? next() : res.status(403).json({ error: 'Только для ученика' });

// ---------- auth ----------
app.post('/api/register-tutor', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !isEmail(email) || !password || password.length < 6)
    return res.status(400).json({ error: 'Укажите имя, корректный email и пароль от 6 символов' });
  if (one('SELECT id FROM users WHERE email=?', email.toLowerCase()))
    return res.status(400).json({ error: 'Этот email уже зарегистрирован' });
  const r = run("INSERT INTO users(role,name,email,pass_hash) VALUES('tutor',?,?,?)",
    name.trim(), email.toLowerCase(), hashPassword(password));
  startSession(res, r.lastInsertRowid);
  res.json({ user: publicUser(one('SELECT * FROM users WHERE id=?', r.lastInsertRowid)) });
});

app.post('/api/register-student', (req, res) => {
  const { name, email, password, code } = req.body || {};
  if (!name || !isEmail(email) || !password || password.length < 6)
    return res.status(400).json({ error: 'Укажите имя, корректный email и пароль от 6 символов' });
  const inv = one('SELECT * FROM invites WHERE code=? AND active=1', String(code || '').trim().toUpperCase());
  if (!inv) return res.status(400).json({ error: 'Ключ приглашения не найден или отключён' });
  if (inv.max_uses > 0 && inv.uses >= inv.max_uses)
    return res.status(400).json({ error: 'Ключ приглашения уже использован' });
  if (one('SELECT id FROM users WHERE email=?', email.toLowerCase()))
    return res.status(400).json({ error: 'Этот email уже зарегистрирован' });
  const r = run("INSERT INTO users(role,name,email,pass_hash,tutor_id,exam) VALUES('student',?,?,?,?,?)",
    name.trim(), email.toLowerCase(), hashPassword(password), inv.tutor_id, inv.exam || null);
  run('UPDATE invites SET uses=uses+1 WHERE id=?', inv.id);
  startSession(res, r.lastInsertRowid);
  res.json({ user: publicUser(one('SELECT * FROM users WHERE id=?', r.lastInsertRowid)) });
});

app.get('/api/invite-info/:code', (req, res) => {
  const inv = one(`SELECT i.*, u.name tutor_name FROM invites i JOIN users u ON u.id=i.tutor_id
    WHERE code=? AND active=1`, req.params.code.toUpperCase());
  if (!inv || (inv.max_uses > 0 && inv.uses >= inv.max_uses)) return res.status(404).json({ error: 'Ключ недействителен' });
  res.json({ tutor_name: inv.tutor_name, exam: inv.exam });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = one('SELECT * FROM users WHERE email=?', String(email || '').toLowerCase());
  if (!u || !checkPassword(String(password || ''), u.pass_hash))
    return res.status(400).json({ error: 'Неверный email или пароль' });
  startSession(res, u.id);
  res.json({ user: publicUser(u) });
});

app.post('/api/logout', (req, res) => {
  const sid = parseCookies(req).sid;
  if (sid) run('DELETE FROM sessions WHERE token=?', sid);
  res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => res.json({ user: publicUser(req.user) }));

app.put('/api/me/theme', auth, (req, res) => {
  run('UPDATE users SET theme=? WHERE id=?', JSON.stringify(req.body || {}), req.user.id);
  res.json({ ok: true });
});

app.put('/api/me/password', auth, (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!checkPassword(String(old_password || ''), req.user.pass_hash))
    return res.status(400).json({ error: 'Старый пароль неверен' });
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'Пароль от 6 символов' });
  run('UPDATE users SET pass_hash=? WHERE id=?', hashPassword(new_password), req.user.id);
  res.json({ ok: true });
});

// ---------- invites & students ----------
app.get('/api/invites', tutorOnly, (req, res) =>
  res.json(all('SELECT * FROM invites WHERE tutor_id=? ORDER BY id DESC', req.user.id)));

app.post('/api/invites', tutorOnly, (req, res) => {
  const { note, exam, max_uses } = req.body || {};
  let code;
  do code = makeCode(); while (one('SELECT id FROM invites WHERE code=?', code));
  run('INSERT INTO invites(tutor_id,code,note,exam,max_uses) VALUES(?,?,?,?,?)',
    req.user.id, code, note || '', exam || null, Math.max(0, parseInt(max_uses ?? 1) || 0));
  res.json(one('SELECT * FROM invites WHERE code=?', code));
});

app.put('/api/invites/:id', tutorOnly, (req, res) => {
  run('UPDATE invites SET active=? WHERE id=? AND tutor_id=?', req.body.active ? 1 : 0, req.params.id, req.user.id);
  res.json({ ok: true });
});
app.delete('/api/invites/:id', tutorOnly, (req, res) => {
  run('DELETE FROM invites WHERE id=? AND tutor_id=?', req.params.id, req.user.id);
  res.json({ ok: true });
});

app.get('/api/students', tutorOnly, (req, res) => {
  res.json(all(`SELECT u.id,u.name,u.email,u.exam,u.created_at,
      (SELECT COUNT(*) FROM attempts a WHERE a.student_id=u.id) attempts,
      (SELECT ROUND(AVG(a.percent),1) FROM attempts a WHERE a.student_id=u.id) avg_percent,
      (SELECT ROUND(AVG(a.grade),2) FROM attempts a WHERE a.student_id=u.id) avg_grade,
      (SELECT COUNT(*) FROM submissions s WHERE s.student_id=u.id) submissions,
      (SELECT ROUND(AVG(s.grade),2) FROM submissions s WHERE s.student_id=u.id AND s.grade IS NOT NULL) avg_hw_grade
    FROM users u WHERE u.tutor_id=? ORDER BY u.name`, req.user.id));
});
app.put('/api/students/:id', tutorOnly, (req, res) => {
  run('UPDATE users SET exam=? WHERE id=? AND tutor_id=?', req.body.exam || null, req.params.id, req.user.id);
  res.json({ ok: true });
});
app.delete('/api/students/:id', tutorOnly, (req, res) => {
  run("DELETE FROM users WHERE id=? AND tutor_id=? AND role='student'", req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---------- files ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).slice(0, 10)),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

app.post('/api/files', auth, (req, res) => {
  upload.array('files', 10)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Файл больше 25 МБ' : err.message });
    const shared = req.user.role === 'tutor' && req.body.shared === '1' ? 1 : 0;
    const out = (req.files || []).map((f) => {
      // multer отдаёт имя в latin1 — переводим в utf8 для кириллицы
      const name = Buffer.from(f.originalname, 'latin1').toString('utf8');
      const r = run('INSERT INTO files(owner_id,tutor_id,orig_name,stored_name,mime,size,shared) VALUES(?,?,?,?,?,?,?)',
        req.user.id, groupOf(req.user), name, f.filename, f.mimetype, f.size, shared);
      return one('SELECT * FROM files WHERE id=?', r.lastInsertRowid);
    });
    res.json(out);
  });
});

app.get('/api/files', auth, (req, res) => {
  if (req.user.role === 'tutor')
    return res.json(all(`SELECT f.*, u.name owner_name FROM files f JOIN users u ON u.id=f.owner_id
      WHERE f.tutor_id=? ORDER BY f.id DESC`, req.user.id));
  res.json(all(`SELECT f.*, u.name owner_name FROM files f JOIN users u ON u.id=f.owner_id
    WHERE (f.tutor_id=? AND f.shared=1) OR f.owner_id=? ORDER BY f.id DESC`, req.user.tutor_id, req.user.id));
});

app.put('/api/files/:id', tutorOnly, (req, res) => {
  run('UPDATE files SET shared=? WHERE id=? AND tutor_id=?', req.body.shared ? 1 : 0, req.params.id, req.user.id);
  res.json({ ok: true });
});

function canAccessFile(u, f) {
  if (!f) return false;
  if (u.role === 'tutor') return f.tutor_id === u.id;
  if (f.owner_id === u.id) return true;
  if (f.tutor_id !== u.tutor_id) return false;
  if (f.shared) return true;
  return !!one(`SELECT 1 FROM homework_files hf WHERE hf.file_id=?`, f.id);
}

app.get('/api/files/:id/download', auth, (req, res) => {
  const f = one('SELECT * FROM files WHERE id=?', req.params.id);
  if (!canAccessFile(req.user, f)) return res.status(404).send('Файл не найден');
  const inline = req.query.inline === '1';
  res.setHeader('Content-Type', f.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.orig_name)}`);
  res.sendFile(path.join(UPLOAD_DIR, f.stored_name));
});

app.delete('/api/files/:id', auth, (req, res) => {
  const f = one('SELECT * FROM files WHERE id=?', req.params.id);
  if (!f || !(f.owner_id === req.user.id || (req.user.role === 'tutor' && f.tutor_id === req.user.id)))
    return res.status(404).json({ error: 'Файл не найден' });
  run('DELETE FROM files WHERE id=?', f.id);
  fs.rm(path.join(UPLOAD_DIR, f.stored_name), () => {});
  res.json({ ok: true });
});

const filesFor = (table, col, id) =>
  all(`SELECT f.id,f.orig_name,f.size,f.mime FROM ${table} x JOIN files f ON f.id=x.file_id WHERE x.${col}=?`, id);

// ---------- homework ----------
function homeworkVisible(u, hw) {
  if (!hw) return false;
  if (u.role === 'tutor') return hw.tutor_id === u.id;
  if (hw.tutor_id !== u.tutor_id) return false;
  const targets = all('SELECT student_id FROM homework_targets WHERE homework_id=?', hw.id);
  return targets.length === 0 || targets.some((t) => t.student_id === u.id);
}

app.get('/api/homework', auth, (req, res) => {
  const u = req.user;
  if (u.role === 'tutor') {
    const list = all(`SELECT h.*,
      (SELECT COUNT(*) FROM submissions s WHERE s.homework_id=h.id) submitted,
      (SELECT COUNT(*) FROM submissions s WHERE s.homework_id=h.id AND s.status='submitted') to_review
      FROM homework h WHERE tutor_id=? ORDER BY h.id DESC`, u.id);
    list.forEach((h) => {
      const t = all('SELECT u.name FROM homework_targets ht JOIN users u ON u.id=ht.student_id WHERE homework_id=?', h.id);
      h.targets = t.map((x) => x.name);
      h.target_count = t.length || one('SELECT COUNT(*) c FROM users WHERE tutor_id=?', u.id).c;
    });
    return res.json(list);
  }
  const list = all(`SELECT h.*, s.status my_status, s.grade my_grade FROM homework h
    LEFT JOIN submissions s ON s.homework_id=h.id AND s.student_id=?
    WHERE h.tutor_id=? ORDER BY COALESCE(h.due_date,'9999') ASC, h.id DESC`, u.id, u.tutor_id);
  res.json(list.filter((h) => homeworkVisible(u, h)));
});

app.post('/api/homework', tutorOnly, (req, res) => {
  const { title, description, subject, due_date, student_ids = [], file_ids = [] } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Укажите название' });
  const r = run('INSERT INTO homework(tutor_id,title,description,subject,due_date) VALUES(?,?,?,?,?)',
    req.user.id, title, description || '', subject || '', due_date || null);
  const id = r.lastInsertRowid;
  for (const sid of student_ids)
    if (one('SELECT 1 FROM users WHERE id=? AND tutor_id=?', sid, req.user.id))
      run('INSERT INTO homework_targets VALUES(?,?)', id, sid);
  for (const fid of file_ids)
    if (one('SELECT 1 FROM files WHERE id=? AND tutor_id=?', fid, req.user.id))
      run('INSERT INTO homework_files VALUES(?,?)', id, fid);
  res.json({ id });
});

app.get('/api/homework/:id', auth, (req, res) => {
  const hw = one('SELECT * FROM homework WHERE id=?', req.params.id);
  if (!homeworkVisible(req.user, hw)) return res.status(404).json({ error: 'Задание не найдено' });
  hw.files = filesFor('homework_files', 'homework_id', hw.id);
  const withFiles = (s) => s && { ...s, files: filesFor('submission_files', 'submission_id', s.id) };
  if (req.user.role === 'tutor') {
    const targets = all('SELECT student_id FROM homework_targets WHERE homework_id=?', hw.id).map((t) => t.student_id);
    const students = all('SELECT id,name FROM users WHERE tutor_id=? ORDER BY name', req.user.id)
      .filter((s) => targets.length === 0 || targets.includes(s.id));
    hw.students = students.map((s) => ({
      ...s, submission: withFiles(one('SELECT * FROM submissions WHERE homework_id=? AND student_id=?', hw.id, s.id)),
    }));
  } else {
    hw.submission = withFiles(one('SELECT * FROM submissions WHERE homework_id=? AND student_id=?', hw.id, req.user.id));
  }
  res.json(hw);
});

app.delete('/api/homework/:id', tutorOnly, (req, res) => {
  run('DELETE FROM homework WHERE id=? AND tutor_id=?', req.params.id, req.user.id);
  res.json({ ok: true });
});

app.post('/api/homework/:id/submit', studentOnly, (req, res) => {
  const hw = one('SELECT * FROM homework WHERE id=?', req.params.id);
  if (!homeworkVisible(req.user, hw)) return res.status(404).json({ error: 'Задание не найдено' });
  const { text, file_ids = [] } = req.body || {};
  const ex = one('SELECT * FROM submissions WHERE homework_id=? AND student_id=?', hw.id, req.user.id);
  if (ex && ex.status === 'reviewed') return res.status(400).json({ error: 'Работа уже проверена' });
  let sid;
  if (ex) {
    run("UPDATE submissions SET text=?, status='submitted', updated_at=datetime('now') WHERE id=?", text || '', ex.id);
    sid = ex.id;
  } else {
    sid = run('INSERT INTO submissions(homework_id,student_id,text) VALUES(?,?,?)', hw.id, req.user.id, text || '').lastInsertRowid;
  }
  for (const fid of file_ids)
    if (one('SELECT 1 FROM files WHERE id=? AND owner_id=?', fid, req.user.id))
      run('INSERT INTO submission_files VALUES(?,?)', sid, fid);
  res.json({ ok: true });
});

app.put('/api/submissions/:id/review', tutorOnly, (req, res) => {
  const s = one(`SELECT s.id FROM submissions s JOIN homework h ON h.id=s.homework_id WHERE s.id=? AND h.tutor_id=?`,
    req.params.id, req.user.id);
  if (!s) return res.status(404).json({ error: 'Не найдено' });
  const { grade, comment, status } = req.body || {};
  run("UPDATE submissions SET grade=?, comment=?, status=?, updated_at=datetime('now') WHERE id=?",
    grade ? parseInt(grade) : null, comment || '', status === 'returned' ? 'returned' : 'reviewed', s.id);
  res.json({ ok: true });
});

// ---------- tests ----------
const DEFAULT_SCALE = { 5: 85, 4: 65, 3: 45 };
function gradeFor(percent, scale) {
  scale = scale || DEFAULT_SCALE;
  if (percent >= scale[5]) return 5;
  if (percent >= scale[4]) return 4;
  if (percent >= scale[3]) return 3;
  return 2;
}
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, '').replace(/,/g, '.');

function checkAnswer(qn, ans) {
  const pts = Number(qn.points) || 1;
  if (qn.type === 'single') return Number(ans) === Number(qn.correct) ? pts : 0;
  if (qn.type === 'multiple') {
    const a = [...new Set((ans || []).map(Number))].sort();
    const c = [...(qn.correct || [])].map(Number).sort();
    if (a.length === c.length && a.every((v, i) => v === c[i])) return pts;
    // как в ЕГЭ: одна ошибка — минус балл, если за задание больше 1 балла
    if (pts > 1 && qn.partial) {
      const wrong = a.filter((v) => !c.includes(v)).length + c.filter((v) => !a.includes(v)).length;
      if (wrong === 1) return pts - 1;
    }
    return 0;
  }
  // text / number: несколько допустимых ответов через ;
  const variants = String(qn.correct || '').split(';').map(norm).filter(Boolean);
  return variants.includes(norm(ans)) ? pts : 0;
}

function sanitizeQuestions(qs) {
  return (Array.isArray(qs) ? qs : []).map((x, i) => ({
    id: x.id || 'q' + (i + 1) + crypto.randomBytes(3).toString('hex'),
    type: ['single', 'multiple', 'text'].includes(x.type) ? x.type : 'single',
    text: String(x.text || ''),
    options: Array.isArray(x.options) ? x.options.map(String) : [],
    correct: x.correct,
    points: Math.max(1, Number(x.points) || 1),
    partial: !!x.partial,
    explanation: String(x.explanation || ''),
  }));
}
function testVisible(u, t) {
  if (!t) return false;
  if (u.role === 'tutor') return t.tutor_id === u.id;
  return t.tutor_id === u.tutor_id && t.published && (!t.exam || !u.exam || t.exam === u.exam || t.exam === 'any');
}
function testOut(t, forStudent) {
  const qs = JSON.parse(t.questions);
  return {
    ...t, scale: JSON.parse(t.scale),
    max_score: qs.reduce((s, x) => s + x.points, 0),
    question_count: qs.length,
    questions: forStudent ? qs.map(({ correct, explanation, ...rest }) => rest) : qs,
  };
}

app.get('/api/tests', auth, (req, res) => {
  const u = req.user;
  if (u.role === 'tutor') {
    const list = all(`SELECT t.*, (SELECT COUNT(*) FROM attempts a WHERE a.test_id=t.id) attempts_count,
      (SELECT ROUND(AVG(percent),1) FROM attempts a WHERE a.test_id=t.id) avg_percent
      FROM tests t WHERE tutor_id=? ORDER BY id DESC`, u.id);
    return res.json(list.map((t) => { const o = testOut(t, false); delete o.questions; return o; }));
  }
  const list = all('SELECT * FROM tests WHERE tutor_id=? ORDER BY id DESC', u.tutor_id).filter((t) => testVisible(u, t));
  res.json(list.map((t) => {
    const o = testOut(t, true); delete o.questions;
    const best = one('SELECT MAX(percent) p, COUNT(*) c FROM attempts WHERE test_id=? AND student_id=?', t.id, u.id);
    const last = one('SELECT id, score, max_score, grade FROM attempts WHERE test_id=? AND student_id=? ORDER BY id DESC LIMIT 1', t.id, u.id);
    return { ...o, my_attempts: best.c, my_best: best.p, my_last: last };
  }));
});

function saveTest(req, res, id) {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'Укажите название теста' });
  const qs = sanitizeQuestions(b.questions);
  if (!qs.length) return res.status(400).json({ error: 'Добавьте хотя бы один вопрос' });
  const scale = { 5: +b.scale?.[5] || 85, 4: +b.scale?.[4] || 65, 3: +b.scale?.[3] || 45 };
  const vals = [b.title, b.description || '', b.subject || '', b.exam || 'any', parseInt(b.time_limit) || 0,
    JSON.stringify(qs), JSON.stringify(scale), b.show_answers ? 1 : 0, parseInt(b.max_attempts) || 0, b.published === false ? 0 : 1];
  if (id) {
    const r = run(`UPDATE tests SET title=?,description=?,subject=?,exam=?,time_limit=?,questions=?,scale=?,show_answers=?,
      max_attempts=?,published=? WHERE id=? AND tutor_id=?`, ...vals, id, req.user.id);
    if (!r.changes) return res.status(404).json({ error: 'Тест не найден' });
    return res.json({ id: Number(id) });
  }
  const r = run(`INSERT INTO tests(title,description,subject,exam,time_limit,questions,scale,show_answers,max_attempts,published,tutor_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`, ...vals, req.user.id);
  res.json({ id: r.lastInsertRowid });
}
app.post('/api/tests', tutorOnly, (req, res) => saveTest(req, res));
app.put('/api/tests/:id', tutorOnly, (req, res) => saveTest(req, res, req.params.id));
app.delete('/api/tests/:id', tutorOnly, (req, res) => {
  run('DELETE FROM tests WHERE id=? AND tutor_id=?', req.params.id, req.user.id);
  res.json({ ok: true });
});

app.get('/api/tests/:id', auth, (req, res) => {
  const t = one('SELECT * FROM tests WHERE id=?', req.params.id);
  if (!testVisible(req.user, t)) return res.status(404).json({ error: 'Тест не найден' });
  const o = testOut(t, req.user.role === 'student');
  if (req.user.role === 'student')
    o.my_attempts = one('SELECT COUNT(*) c FROM attempts WHERE test_id=? AND student_id=?', t.id, req.user.id).c;
  res.json(o);
});

app.post('/api/tests/:id/attempt', studentOnly, (req, res) => {
  const t = one('SELECT * FROM tests WHERE id=?', req.params.id);
  if (!testVisible(req.user, t)) return res.status(404).json({ error: 'Тест не найден' });
  const used = one('SELECT COUNT(*) c FROM attempts WHERE test_id=? AND student_id=?', t.id, req.user.id).c;
  if (t.max_attempts > 0 && used >= t.max_attempts) return res.status(400).json({ error: 'Попытки закончились' });
  const qs = JSON.parse(t.questions);
  const answers = (req.body && req.body.answers) || {};
  let score = 0, max = 0;
  const details = qs.map((qn) => {
    const got = checkAnswer(qn, answers[qn.id]);
    score += got; max += qn.points;
    return { id: qn.id, got, points: qn.points, answer: answers[qn.id] ?? null };
  });
  const percent = max ? Math.round((score / max) * 1000) / 10 : 0;
  const grade = gradeFor(percent, JSON.parse(t.scale));
  const r = run('INSERT INTO attempts(test_id,student_id,answers,details,score,max_score,percent,grade) VALUES(?,?,?,?,?,?,?,?)',
    t.id, req.user.id, JSON.stringify(answers), JSON.stringify(details), score, max, percent, grade);
  res.json({ id: r.lastInsertRowid });
});

app.get('/api/attempts/:id', auth, (req, res) => {
  const a = one(`SELECT a.*, u.name student_name, t.title, t.tutor_id, t.show_answers, t.questions, t.scale
    FROM attempts a JOIN tests t ON t.id=a.test_id JOIN users u ON u.id=a.student_id WHERE a.id=?`, req.params.id);
  if (!a || !(a.student_id === req.user.id || (req.user.role === 'tutor' && a.tutor_id === req.user.id)))
    return res.status(404).json({ error: 'Не найдено' });
  const reveal = req.user.role === 'tutor' || a.show_answers;
  const qs = JSON.parse(a.questions);
  const details = JSON.parse(a.details);
  a.review = qs.map((qn) => {
    const d = details.find((x) => x.id === qn.id) || { got: 0, points: qn.points, answer: null };
    const item = { ...qn, ...d, points: qn.points };
    if (!reveal) { delete item.correct; delete item.explanation; }
    return item;
  });
  a.scale = JSON.parse(a.scale);
  delete a.questions; delete a.details; delete a.answers;
  res.json(a);
});

app.get('/api/tests/:id/results', tutorOnly, (req, res) => {
  const t = one('SELECT * FROM tests WHERE id=? AND tutor_id=?', req.params.id, req.user.id);
  if (!t) return res.status(404).json({ error: 'Тест не найден' });
  res.json({
    test: testOut(t, false),
    attempts: all(`SELECT a.id,a.score,a.max_score,a.percent,a.grade,a.finished_at,u.name student_name,u.id student_id
      FROM attempts a JOIN users u ON u.id=a.student_id WHERE a.test_id=? ORDER BY a.id DESC`, t.id),
  });
});

app.get('/api/my-results', auth, (req, res) => {
  const where = req.user.role === 'tutor' ? 't.tutor_id=?' : 'a.student_id=?';
  res.json(all(`SELECT a.id,a.score,a.max_score,a.percent,a.grade,a.finished_at,t.title,t.id test_id,u.name student_name
    FROM attempts a JOIN tests t ON t.id=a.test_id JOIN users u ON u.id=a.student_id
    WHERE ${where} ORDER BY a.id DESC LIMIT 50`, req.user.id));
});

// ---------- dashboard ----------
app.get('/api/dashboard', auth, (req, res) => {
  const u = req.user;
  if (u.role === 'tutor') {
    return res.json({
      students: one('SELECT COUNT(*) c FROM users WHERE tutor_id=?', u.id).c,
      homework: one('SELECT COUNT(*) c FROM homework WHERE tutor_id=?', u.id).c,
      tests: one('SELECT COUNT(*) c FROM tests WHERE tutor_id=?', u.id).c,
      to_review: one(`SELECT COUNT(*) c FROM submissions s JOIN homework h ON h.id=s.homework_id
        WHERE h.tutor_id=? AND s.status='submitted'`, u.id).c,
      avg_percent: one(`SELECT ROUND(AVG(a.percent),1) p FROM attempts a JOIN tests t ON t.id=a.test_id WHERE t.tutor_id=?`, u.id).p,
    });
  }
  res.json({
    avg_percent: one('SELECT ROUND(AVG(percent),1) p FROM attempts WHERE student_id=?', u.id).p,
    avg_grade: one('SELECT ROUND(AVG(grade),2) g FROM attempts WHERE student_id=?', u.id).g,
    attempts: one('SELECT COUNT(*) c FROM attempts WHERE student_id=?', u.id).c,
    reviewed: one("SELECT COUNT(*) c FROM submissions WHERE student_id=? AND status='reviewed'", u.id).c,
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Сайт запущен: http://localhost:${PORT}`));
