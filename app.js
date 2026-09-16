const API_URL = 'https://journaling.nadersayed742.workers.dev';
const USERS = ['Nadoooor', 'ZIZO932'];
let password = '';
let entries = [];
let currentMd = '';

const $ = id => document.getElementById(id);
const today = () => {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

function parse(md) {
  if (!md) return [];
  const out = [];
  const re = /^## Day (\d+) \[!\[@([^\]]+)\][^\n]*\n\n- \*\*Date:\*\* ?(.*?)\n- \*\*Total hours spent:\*\* ?(.*?)\n\n### Entry:\n\n([\s\S]*?)\n\n### Recording links:\s*\n([\s\S]*?)(?=\n(?:------------------------------\n\n)?## Day |$)/gm;
  let m;
  while ((m = re.exec(md))) {
    out.push({
      day: +m[1],
      github: m[2],
      date: m[3].trim(),
      hours: m[4].trim(),
      body: m[5].trim(),
      links: m[6].split('\n').map(x => x.replace(/^[-*]\s+/, '').trim()).filter(x => x.startsWith('http'))
    });
  }
  return out;
}

function maxDay() {
  return Math.max(1, ...entries.map(e => e.day));
}

function ordered() {
  const a = [];
  for (let d = 1; d <= maxDay(); d++) {
    for (const u of USERS) {
      a.push(entries.find(e => e.day === d && e.github === u) || { day: d, github: u, date: '', hours: '', body: '', links: [] });
    }
  }
  return a;
}

function nextSlot() {
  for (const e of ordered()) {
    if (!e.body) return e;
  }
  return { day: maxDay() + 1, github: USERS[0], date: '', hours: '', body: '', links: [] };
}

function select(e) {
  $('writer').value = e.github;
  $('day').value = e.day;
  $('date').value = e.date || today();
  $('hours').value = e.hours || '';
  $('body').value = e.body || '';
  $('links').value = (e.links || []).join('\n');
  render();
}

function render() {
  const seq = $('sequence');
  if (!seq) return;
  seq.innerHTML = '';
  ordered().forEach(e => {
    const d = document.createElement('div');
    d.className = 'slot';
    if (+$('day').value === e.day && $('writer').value === e.github) d.classList.add('active');
    d.innerHTML = `<b>@${e.github} — Day ${e.day}</b><small class="${e.body ? 'done' : ''}">${e.body ? '✓ completed' : 'empty'}</small>`;
    d.onclick = () => select(e);
    seq.appendChild(d);
  });
  if ($('preview')) $('preview').textContent = currentMd;
}

async function api(endpoint, opts = {}) {
  const r = await fetch(API_URL + endpoint, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Journal-Password': password,
      ...(opts.headers || {})
    }
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function refresh() {
  // Fixed endpoint from '/' to '/api/journal'
  const data = await api('/api/journal');
  currentMd = data.content || '';
  entries = parse(currentMd);
  const n = nextSlot();
  select(n);
  render();
  if ($('sync')) $('sync').textContent = '🟢 Synced with GitHub';
}

$('loginBtn').onclick = async () => {
  password = $('password').value;
  if (!password) return;
  $('loginMsg').textContent = 'Connecting…';
  try {
    await refresh();
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('loginMsg').textContent = '';
  } catch (e) {
    password = '';
    $('loginMsg').className = 'err';
    $('loginMsg').textContent = e.message;
  }
};

$('refresh').onclick = async () => {
  try {
    await refresh();
    $('msg').className = 'ok';
    $('msg').textContent = 'Refreshed from GitHub.';
  } catch (e) {
    $('msg').className = 'err';
    $('msg').textContent = e.message;
  }
};

$('save').onclick = async () => {
  const entry = {
    github: $('writer').value,
    day: +$('day').value,
    date: $('date').value.trim(),
    hours: $('hours').value.trim(),
    body: $('body').value.trim(),
    links: $('links').value.split(/\n+/).map(x => x.trim()).filter(Boolean)
  };
  if (!entry.body) {
    $('msg').className = 'err';
    $('msg').textContent = 'Write the entry first.';
    return;
  }
  try {
    $('save').disabled = true;
    $('msg').textContent = 'Saving…';
    // Fixed endpoint from '/' to '/api/journal'
    const data = await api('/api/journal', {
      method: 'POST',
      body: JSON.stringify(entry)
    });
    currentMd = data.content || '';
    entries = parse(currentMd);
    $('msg').className = 'ok';
    $('msg').textContent = `Saved @${entry.github} Day ${entry.day} to GitHub.`;
    render();
  } catch (e) {
    $('msg').className = 'err';
    $('msg').textContent = e.message;
  } finally {
    $('save').disabled = false;
  }
};

$('copy').onclick = async () => {
  await navigator.clipboard.writeText(currentMd);
  $('msg').className = 'ok';
  $('msg').textContent = 'Full Markdown copied.';
};

$('download').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([currentMd], { type: 'text/markdown' }));
  a.download = 'Journal.md';
  a.click();
};

['writer', 'day', 'date', 'hours', 'body', 'links'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('input', render);
});
