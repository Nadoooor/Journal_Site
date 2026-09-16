const API_URL = 'https://journaling.nadersayed742.workers.dev';
const USERS = ['Nadoooor', 'ZIZO932'];
let password = '';
let entries = [];
let currentMd = '';
let isRenderedView = false;

const $ = id => document.getElementById(id);
const today = () => {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

// Simple Markdown to HTML parser for rendered preview
function mdToHtml(md) {
  return md
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.* vast?)\*\*/gim, '<b>$1</b>')
    .replace(/\*(.* vast?)\*/gim, '<i>$1</i>')
    .replace(/!\[([^\]]+)\]\(([^)]+)\)/gim, '<img alt="$1" src="$2" style="max-width:100%; border-radius:8px; margin:10px 0;" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" style="color:#60a5fa">$1</a>')
    .replace(/\n/gim, '<br>');
}

function parse(md) {
  if (!md) return [];
  const out = [];

  // Robust Regex to handle badge links, empty dates, empty entries, and varying separators
  const re = /^## Day (\d+)\s+\[!\[@([^\]]+)\][^\n]*\n\n-\s+\*\*Date:\*\*\s*(.*?)\n-\s+\*\*Total hours spent:\*\*\s*(.*?)\n\n### Entry:\s*\n([\s\S]*?)\n\n### Recording links:\s*\n([\s\S]*?)(?=\n(?:---+|---+|\s*)\n\n## Day |$)/gm;

  let m;
  while ((m = re.exec(md))) {
    const rawLinks = m[6].trim();
    const links = rawLinks
      ? rawLinks.split('\n').map(x => x.replace(/^[-*]\s+/, '').trim()).filter(x => x.startsWith('http'))
      : [];

    out.push({
      day: parseInt(m[1], 10),
      github: m[2].trim(),
      date: m[3].trim(),
      hours: m[4].trim(),
      body: m[5].trim(),
      links: links
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
  if (seq) {
    seq.innerHTML = '';
    ordered().forEach(e => {
      const d = document.createElement('div');
      d.className = 'slot';
      if (+$('day').value === e.day && $('writer').value === e.github) d.classList.add('active');
      d.innerHTML = `<b>@${e.github} — Day ${e.day}</b><small class="${e.body ? 'done' : ''}">${e.body ? '✓ completed' : 'empty'}</small>`;
      d.onclick = () => select(e);
      seq.appendChild(d);
    });
  }

  if (isRenderedView) {
    $('preview').classList.add('hidden');
    $('renderedPreview').classList.remove('hidden');
    $('renderedPreview').innerHTML = mdToHtml(currentMd);
  } else {
    $('renderedPreview').classList.add('hidden');
    $('preview').classList.remove('hidden');
    $('preview').textContent = currentMd;
  }
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
  const data = await api('/api/journal');
  currentMd = data.content || '';
  entries = parse(currentMd);
  const n = nextSlot();
  select(n);
  render();
  if ($('sync')) $('sync').textContent = '🟢 Synced with GitHub';
}

// Button Listeners
$('fetchJournal').onclick = async () => {
  try {
    $('msg').textContent = 'Fetching file content...';
    await refresh();
    $('msg').className = 'ok';
    $('msg').textContent = 'File content fetched successfully.';
  } catch (e) {
    $('msg').className = 'err';
    $('msg').textContent = e.message;
  }
};

$('toggleView').onclick = () => {
  isRenderedView = !isRenderedView;
  $('toggleView').textContent = isRenderedView ? 'Show Raw Code' : 'Toggle Rendered Preview';
  render();
};

$('uploadImage').onclick = async () => {
  const fileInput = $('imageInput');
  if (!fileInput.files.length) {
    $('msg').className = 'err';
    $('msg').textContent = 'Please select an image file first.';
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = async () => {
    const base64Data = reader.result.split(',')[1];
    const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;

    try {
      $('msg').textContent = 'Uploading image to Images/Journal...';
      const res = await api('/api/upload-image', {
        method: 'POST',
        body: JSON.stringify({
          filename: fileName,
          content: base64Data
        })
      });

      // Insert markdown tag into textarea
      const imageTag = `\n![Image](Images/Journal/${fileName})\n`;
      $('body').value += imageTag;
      $('msg').className = 'ok';
      $('msg').textContent = 'Image uploaded and inserted into entry!';
      render();
    } catch (e) {
      $('msg').className = 'err';
      $('msg').textContent = e.message;
    }
  };

  reader.readAsDataURL(file);
};

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

$('refresh').onclick = refresh;

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
  a.download = 'JOURNAL.md';
  a.click();
};

['writer', 'day', 'date', 'hours', 'body', 'links'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('input', render);
});