const API_URL = 'https://journaling.nadersayed742.workers.dev';
const USERS = ['Nadoooor', 'ZIZO932'];
const TOKEN_KEY = 'walle-journal-session';

let entries = [];
let currentMarkdown = '';
let renderedView = false;

const $ = id => document.getElementById(id);
const today = () => {
  const date = new Date();
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMarkdown(markdown) {
  let html = escapeHtml(markdown);
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return html.replace(/\n/g, '<br>');
}

function parseMarkdown(markdown) {
  if (!markdown) return [];

  return markdown.split(/(?=^## Day \d+)/gm).reduce((result, block) => {
    if (!block.trim().startsWith('## Day')) return result;

    const header = block.match(/^## Day (\d+).*?@([A-Za-z0-9_-]+)/m);
    if (!header) return result;

    const bodyMatch = block.match(/### Entry:\s*\n([\s\S]*?)(?=\n### Recording links:|$)/i);
    const linksMatch = block.match(/### Recording links:\s*\n([\s\S]*?)(?=\n(?:---+|## Day )|$)/i);

    result.push({
      day: Number(header[1]),
      github: header[2],
      date: (block.match(/-\s+\*\*Date:\*\*\s*(.*)/i) || ['', ''])[1].trim(),
      hours: (block.match(/-\s+\*\*Total hours spent:\*\*\s*(.*)/i) || ['', ''])[1].trim(),
      body: bodyMatch ? bodyMatch[1].trim() : '',
      links: linksMatch ? linksMatch[1].split('\n').map(line => line.replace(/^[-*]\s+/, '').trim()).filter(Boolean) : []
    });
    return result;
  }, []);
}

function orderedEntries() {
  const maxDay = Math.max(1, ...entries.map(entry => entry.day));
  const ordered = [];
  for (let day = 1; day <= maxDay; day += 1) {
    for (const github of USERS) {
      ordered.push(entries.find(entry => entry.day === day && entry.github === github) || {
        day, github, date: '', hours: '', body: '', links: []
      });
    }
  }
  return ordered;
}

function nextSlot() {
  const empty = orderedEntries().find(entry => !entry.body);
  if (empty) return empty;
  return { day: Math.max(1, ...entries.map(entry => entry.day)) + 1, github: USERS[0], date: '', hours: '', body: '', links: [] };
}

function selectEntry(entry) {
  $('writer').value = entry.github;
  $('day').value = entry.day;
  $('date').value = entry.date || today();
  $('hours').value = entry.hours || '';
  $('body').value = entry.body || '';
  $('links').value = (entry.links || []).join('\n');
  render();
}

function render() {
  $('sequence').replaceChildren(...orderedEntries().map(entry => {
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'slot';
    if (Number($('day').value) === entry.day && $('writer').value === entry.github) slot.classList.add('active');
    slot.innerHTML = `<b>@${escapeHtml(entry.github)} — Day ${entry.day}</b><small class="${entry.body ? 'done' : ''}">${entry.body ? 'Completed' : 'Empty'}</small>`;
    slot.addEventListener('click', () => selectEntry(entry));
    return slot;
  }));

  if (renderedView) {
    $('preview').classList.add('hidden');
    $('renderedPreview').classList.remove('hidden');
    $('renderedPreview').innerHTML = renderMarkdown(currentMarkdown);
  } else {
    $('preview').classList.remove('hidden');
    $('renderedPreview').classList.add('hidden');
    $('preview').textContent = currentMarkdown;
  }
}

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

async function api(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (getToken()) headers.set('Authorization', `Bearer ${getToken()}`);

  const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function loadJournal() {
  $('msg').textContent = 'Fetching JOURNAL.md...';
  const data = await api('/api/journal');
  currentMarkdown = data.content || '';
  entries = parseMarkdown(currentMarkdown);
  selectEntry(nextSlot());
  $('sync').textContent = 'Synced with GitHub';
  $('msg').className = 'ok';
  $('msg').textContent = 'JOURNAL.md loaded.';
}

async function login() {
  const password = $('password').value;
  if (!password) return;
  $('loginMsg').className = '';
  $('loginMsg').textContent = 'Connecting...';

  try {
    const response = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.token) throw new Error(data.error || 'Login failed');

    sessionStorage.setItem(TOKEN_KEY, data.token);
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('logout').classList.remove('hidden');
    $('password').value = '';
    await loadJournal();
  } catch (error) {
    sessionStorage.removeItem(TOKEN_KEY);
    $('loginMsg').className = 'err';
    $('loginMsg').textContent = error.message;
  }
}

function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  $('app').classList.add('hidden');
  $('login').classList.remove('hidden');
  $('logout').classList.add('hidden');
  $('sync').textContent = 'Not connected';
}

async function uploadImage() {
  const file = $('imageInput').files[0];
  if (!file) {
    $('msg').className = 'err';
    $('msg').textContent = 'Choose an image first.';
    return;
  }
  if (!file.type.startsWith('image/')) {
    $('msg').className = 'err';
    $('msg').textContent = 'Only image files are allowed.';
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      $('uploadImage').disabled = true;
      $('msg').textContent = 'Uploading image...';
      const filename = `${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`;
      const data = await api('/api/upload-image', {
        method: 'POST',
        body: JSON.stringify({ filename, content: reader.result.split(',')[1] })
      });
      $('body').value += `\n![${file.name}](${data.path})\n`;
      $('imageInput').value = '';
      $('msg').className = 'ok';
      $('msg').textContent = 'Image uploaded and Markdown inserted.';
      render();
    } catch (error) {
      $('msg').className = 'err';
      $('msg').textContent = error.message;
    } finally {
      $('uploadImage').disabled = false;
    }
  };
  reader.readAsDataURL(file);
}

async function saveEntry() {
  const entry = {
    github: $('writer').value,
    day: Number($('day').value),
    date: $('date').value.trim(),
    hours: $('hours').value.trim(),
    body: $('body').value.trim(),
    links: $('links').value.split(/\n+/).map(link => link.trim()).filter(Boolean)
  };
  if (!Number.isInteger(entry.day) || entry.day < 1 || !entry.body) {
    $('msg').className = 'err';
    $('msg').textContent = 'Enter a valid day and write an entry first.';
    return;
  }

  try {
    $('save').disabled = true;
    $('msg').textContent = 'Saving to GitHub...';
    const data = await api('/api/journal', { method: 'POST', body: JSON.stringify(entry) });
    currentMarkdown = data.content || '';
    entries = parseMarkdown(currentMarkdown);
    $('msg').className = 'ok';
    $('msg').textContent = `Saved @${entry.github} Day ${entry.day}.`;
    render();
  } catch (error) {
    $('msg').className = 'err';
    $('msg').textContent = error.message;
  } finally {
    $('save').disabled = false;
  }
}

$('loginBtn').addEventListener('click', login);
$('password').addEventListener('keydown', event => { if (event.key === 'Enter') login(); });
$('logout').addEventListener('click', logout);
$('fetchJournal').addEventListener('click', loadJournal);
$('refresh').addEventListener('click', loadJournal);
$('uploadImage').addEventListener('click', uploadImage);
$('save').addEventListener('click', saveEntry);
$('toggleView').addEventListener('click', () => {
  renderedView = !renderedView;
  $('toggleView').textContent = renderedView ? 'Show Markdown Code' : 'Show Rendered Preview';
  render();
});
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(currentMarkdown);
  $('msg').className = 'ok';
  $('msg').textContent = 'Markdown copied.';
});
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([currentMarkdown], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'JOURNAL.md';
  link.click();
  URL.revokeObjectURL(url);
});
['writer', 'day', 'date', 'hours', 'body', 'links'].forEach(id => $(id).addEventListener('input', render));

if (getToken()) {
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('logout').classList.remove('hidden');
  loadJournal().catch(logout);
} else {
  $('login').classList.remove('hidden');
}
