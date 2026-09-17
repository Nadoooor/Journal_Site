const API_URL = 'https://journaling.nadersayed742.workers.dev';
const REPOSITORY_RAW_BASE = 'https://raw.githubusercontent.com/WALL-Es/WALL-E/main/';
const USERS = ['Nadoooor', 'ZIZO932'];
const TOKEN_KEY = 'walle-journal-session';

let entries = [];
let currentMarkdown = '';
let renderedView = false;
let draftSaveTimer;
let draftSaveVersion = 0;
let undoState;
let undoTimer;

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

function normalizeImageSource(source) {
  const trimmedSource = source.trim();
  try {
    const url = new URL(trimmedSource, window.location.href);
    url.pathname = url.pathname.split('/').map(segment => {
      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        return encodeURIComponent(segment);
      }
    }).join('/');
    return url.href;
  } catch {
    return trimmedSource.split('/').map(segment => encodeURIComponent(segment)).join('/');
  }
}

function renderMarkdown(markdown) {
  let html = escapeHtml(markdown);
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/!\[([^\]]*)\]\(([^)\n]+)\)/g, (match, alt, source) => {
    const relativeSource = source.trim().replace(/^\.?\//, '');
    const imageSource = /^https?:\/\//i.test(relativeSource)
      ? normalizeImageSource(relativeSource)
      : `${REPOSITORY_RAW_BASE}${relativeSource.split('/').map(segment => encodeURIComponent(segment)).join('/')}`;
    return `<img alt="${alt}" src="${imageSource}">`;
  });
  html = html.replace(/&lt;img\s+src=&quot;([^&]+)&quot;\s+alt=&quot;([^&]*)&quot;\s+width=&quot;(\d+)&quot;\s+height=&quot;(\d+)&quot;&gt;/gi, (match, source, alt, width, height) => {
    return `<img src="${normalizeImageSource(source)}" alt="${alt}" width="${width}" height="${height}">`;
  });
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
      links: linksMatch ? linksMatch[1].split('\n').map(line => line.replace(/^[-*]\s+/, '').trim()).filter(Boolean) : [],
      committed: true,
      githubExists: true
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

function activeEntryMarkdown() {
  const github = $('writer').value;
  const day = Number($('day').value);
  const date = $('date').value.trim();
  const hours = $('hours').value.trim();
  const body = $('body').value.trim();
  const links = $('links').value.split(/\n+/).map(link => link.trim()).filter(Boolean);
  const badgeColor = github === 'ZIZO932' ? 'd97706' : '2563eb';
  const badge = `[![@${github}](https://img.shields.io/badge/@${github}-${badgeColor}?style=flat-square&logo=github&logoColor=white)](https://github.com/${github})`;
  let markdown = `## Day ${day} ${badge}\n\n- **Date:** ${date}\n- **Total hours spent:** ${hours}\n\n### Entry:\n\n${body}\n\n### Recording links:\n`;
  links.forEach(link => { markdown += `- ${link}\n`; });
  return markdown;
}

function setProcessStatus(id, state, message) {
  const item = $(id);
  if (!item) return;
  item.className = `process-item ${state}`;
  item.querySelector('small').textContent = message;
}

function render() {
  $('sequence').replaceChildren(...orderedEntries().map(entry => {
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'slot';
    if (Number($('day').value) === entry.day && $('writer').value === entry.github) slot.classList.add('active');
    const status = entry.committed && entry.body ? 'Completed' : entry.body ? 'Draft' : 'Empty';
    const statusClass = entry.committed && entry.body ? 'done' : entry.body ? 'draft' : '';
    slot.innerHTML = `<b>@${escapeHtml(entry.github)} — Day ${entry.day}</b><small class="${statusClass}">${status}</small>`;
    slot.addEventListener('click', () => selectEntry(entry));
    return slot;
  }));

  if (renderedView) {
    $('preview').classList.add('hidden');
    $('renderedPreview').classList.remove('hidden');
    $('renderedPreview').innerHTML = renderMarkdown(activeEntryMarkdown());
  } else {
    $('preview').classList.remove('hidden');
    $('renderedPreview').classList.add('hidden');
    $('preview').textContent = activeEntryMarkdown();
  }
}

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

async function api(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (getToken()) headers.set('Authorization', `Bearer ${getToken()}`);

  const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function loadJournal() {
  setProcessStatus('githubStatus', 'working', 'Loading journal');
  $('msg').textContent = 'Fetching JOURNAL.md...';
  let data;
  try {
    data = await api('/api/journal');
    setProcessStatus('githubStatus', 'success', 'Journal loaded');
  } catch (error) {
    setProcessStatus('githubStatus', 'error', 'Load failed');
    throw error;
  }
  currentMarkdown = data.content || '';
  entries = parseMarkdown(currentMarkdown);
  let draftError = '';
  setProcessStatus('draftStatus', 'working', 'Syncing drafts');
  try {
    const draftData = await api('/api/drafts');
    const savedDrafts = new Map((draftData.drafts || []).map(draft => [`${draft.github}:${draft.day}`, draft]));
    entries = entries.map(entry => savedDrafts.has(`${entry.github}:${entry.day}`)
      ? { ...savedDrafts.get(`${entry.github}:${entry.day}`), committed: false, githubExists: entry.githubExists }
      : entry);
    for (const draft of savedDrafts.values()) {
      if (!entries.some(entry => entry.github === draft.github && entry.day === draft.day)) entries.push({ ...draft, committed: false, githubExists: false });
    }
    setProcessStatus('draftStatus', 'success', 'Drafts synced');
  } catch (error) {
    draftError = `Shared drafts unavailable: ${error.message}`;
    setProcessStatus('draftStatus', 'error', 'Sync unavailable');
  }
  selectEntry(nextSlot());
  $('sync').textContent = 'Synced with GitHub';
  $('msg').className = draftError ? 'err' : 'ok';
  $('msg').textContent = draftError || 'JOURNAL.md loaded.';
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

function readImage(file, index) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      filename: file.name.replace(/[^A-Za-z0-9._-]/g, '_'),
      content: reader.result.split(',')[1],
      contentType: file.type
    });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function imageDisplayDimensions() {
  return {
    width: Math.max(1, Math.min(4096, Number($('imageWidth').value) || 1280)),
    height: Math.max(1, Math.min(4096, Number($('imageHeight').value) || 1280))
  };
}

async function uploadImages(files) {
  setProcessStatus('cdnStatus', 'working', `Uploading ${files.length} file${files.length === 1 ? '' : 's'}`);
  const imageData = await Promise.all(files.map((file, index) => readImage(file, index)));
  const dimensions = imageDisplayDimensions();
  try {
    const uploaded = await Promise.all(imageData.map(async image => {
      const data = await api('/api/upload-image', {
        method: 'POST',
        body: JSON.stringify(image)
      });
      return { name: image.filename, path: data.path, reused: data.reused };
    }));
    const reusedCount = uploaded.filter(image => image.reused).length;
    const uploadedCount = uploaded.length - reusedCount;
    const status = [
      uploadedCount ? `${uploadedCount} uploaded` : '',
      reusedCount ? `${reusedCount} reused` : ''
    ].filter(Boolean).join(', ');
    setProcessStatus('cdnStatus', 'success', status);
    $('body').value += `\n${uploaded.map(image => `<img src="${image.path}" alt="${image.name}" width="${dimensions.width}" height="${dimensions.height}">`).join('\n')}\n`;
    updateActiveEntryFromForm();
    scheduleDraftSave();
    render();
    return uploaded;
  } catch (error) {
    setProcessStatus('cdnStatus', 'error', 'Upload failed');
    throw error;
  }
}

async function handleImagePaste(event) {
  const files = Array.from(event.clipboardData?.items || [])
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter(Boolean);
  if (!files.length) return;

  event.preventDefault();
  $('msg').className = '';
  $('msg').textContent = `Uploading ${files.length} pasted image${files.length === 1 ? '' : 's'}...`;
  try {
    await uploadImages(files.map((file, index) => {
      const extension = file.type.split('/')[1] || 'png';
      return new File([file], `pasted-image-${index}.${extension}`, { type: file.type });
    }));
    $('msg').className = 'ok';
    $('msg').textContent = 'Pasted image uploaded and Markdown link inserted.';
  } catch (error) {
    $('msg').className = 'err';
    $('msg').textContent = error.message;
  }
}

function addEmptyEntry() {
  const entry = {
    day: Math.max(0, ...entries.map(item => item.day)) + 1,
    github: USERS[0],
    date: today(),
    hours: '',
    body: '',
    links: []
  };
  entries.push(entry);
  selectEntry(entry);
  $('msg').className = '';
  $('msg').textContent = 'New empty entry ready to edit.';
}

function currentDraft() {
  return {
    github: $('writer').value,
    day: Number($('day').value),
    date: $('date').value.trim(),
    hours: $('hours').value.trim(),
    body: $('body').value,
    links: $('links').value.split(/\n+/).map(link => link.trim()).filter(Boolean)
  };
}

function updateActiveEntryFromForm() {
  const draft = currentDraft();
  let entry = entries.find(item => item.day === draft.day && item.github === draft.github);
  if (!entry) {
    entry = { ...draft, committed: false };
    entries.push(entry);
  } else {
    Object.assign(entry, draft);
    entry.committed = false;
  }
}

function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  const saveVersion = ++draftSaveVersion;
  setProcessStatus('draftStatus', 'working', 'Draft queued');
  draftSaveTimer = setTimeout(async () => {
    const draft = currentDraft();
    if (!Number.isInteger(draft.day) || draft.day < 1) return;
    setProcessStatus('draftStatus', 'working', 'Saving draft');
    try {
      await api('/api/drafts', { method: 'POST', body: JSON.stringify(draft) });
      if (saveVersion === draftSaveVersion) setProcessStatus('draftStatus', 'success', 'Draft saved');
    } catch (error) {
      if (saveVersion !== draftSaveVersion) return;
      setProcessStatus('draftStatus', 'error', 'Save failed');
      $('msg').className = 'err';
      $('msg').textContent = `Draft autosave failed: ${error.message}`;
    }
  }, 500);
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
    clearTimeout(draftSaveTimer);
    $('save').disabled = true;
    setProcessStatus('githubStatus', 'working', 'Committing entry');
    $('msg').textContent = 'Saving to GitHub...';
    const data = await api('/api/journal', { method: 'POST', body: JSON.stringify(entry) });
    setProcessStatus('githubStatus', 'success', 'Entry committed');
    currentMarkdown = data.content || '';
    entries = parseMarkdown(currentMarkdown);
    $('imageInput').value = '';
    await api('/api/drafts', {
      method: 'POST',
      body: JSON.stringify({ github: entry.github, day: entry.day, clear: true })
    }).catch(() => {});
    setProcessStatus('draftStatus', 'success', 'Draft cleared');
    $('msg').className = 'ok';
    $('msg').textContent = `Saved @${entry.github} Day ${entry.day}.`;
    render();
  } catch (error) {
    setProcessStatus('githubStatus', 'error', 'Commit failed');
    $('msg').className = 'err';
    $('msg').textContent = error.message;
  } finally {
    $('save').disabled = false;
  }
}

async function deleteEntry() {
  const entry = entries.find(item => item.day === Number($('day').value) && item.github === $('writer').value);
  if (!entry || !entry.body) {
    $('msg').className = 'err';
    $('msg').textContent = 'There is no entry to delete.';
    return;
  }
  if (!window.confirm(`Delete @${entry.github} Day ${entry.day}?`)) return;

  try {
    clearTimeout(draftSaveTimer);
    draftSaveVersion += 1;
    $('deleteEntry').disabled = true;
    if (entry.githubExists) {
      setProcessStatus('githubStatus', 'working', 'Deleting entry');
      $('msg').textContent = 'Deleting from GitHub...';
      const data = await api('/api/journal', {
        method: 'DELETE',
        body: JSON.stringify({ github: entry.github, day: entry.day })
      });
      currentMarkdown = data.content || '';
      entries = parseMarkdown(currentMarkdown);
      setProcessStatus('githubStatus', 'success', 'Entry deleted');
    } else {
      await api('/api/drafts', {
        method: 'POST',
        body: JSON.stringify({ github: entry.github, day: entry.day, clear: true })
      });
      entries = entries.filter(item => item !== entry);
      setProcessStatus('draftStatus', 'success', 'Draft deleted');
    }
    await api('/api/drafts', {
      method: 'POST',
      body: JSON.stringify({ github: entry.github, day: entry.day, clear: true })
    }).catch(() => {});
    startUndo(entry, entry.githubExists);
    selectEntry(nextSlot());
    $('msg').className = 'ok';
    $('msg').textContent = `Deleted @${entry.github} Day ${entry.day}.`;
    render();
  } catch (error) {
    $('msg').className = 'err';
    $('msg').textContent = `Delete failed: ${error.message}`;
  } finally {
    $('deleteEntry').disabled = false;
  }
}

function startUndo(entry, githubExists) {
  clearUndo();
  undoState = { ...entry, githubExists };
  const button = $('undoEntry');
  let seconds = 60;
  button.textContent = `Undo Delete (${seconds}s)`;
  button.classList.remove('hidden');
  undoTimer = setInterval(() => {
    seconds -= 1;
    if (seconds <= 0) {
      clearUndo();
      return;
    }
    button.textContent = `Undo Delete (${seconds}s)`;
  }, 1000);
}

function clearUndo() {
  clearInterval(undoTimer);
  undoTimer = undefined;
  undoState = undefined;
  const button = $('undoEntry');
  if (button) {
    button.classList.add('hidden');
    button.textContent = 'Undo Delete';
  }
}

async function undoEntry() {
  if (!undoState) return;
  const entry = undoState;
  try {
    $('undoEntry').disabled = true;
    if (entry.githubExists) {
      setProcessStatus('githubStatus', 'working', 'Restoring entry');
      const data = await api('/api/journal/undo', {
        method: 'POST',
        body: JSON.stringify({ github: entry.github, day: entry.day })
      });
      currentMarkdown = data.content || '';
      entries = parseMarkdown(currentMarkdown);
      setProcessStatus('githubStatus', 'success', 'Entry restored');
    } else {
      await api('/api/drafts', {
        method: 'POST',
        body: JSON.stringify({ ...entry, committed: undefined })
      });
      entries.push(entry);
      setProcessStatus('draftStatus', 'success', 'Draft restored');
    }
    clearUndo();
    selectEntry(entry);
    $('msg').className = 'ok';
    $('msg').textContent = `Restored @${entry.github} Day ${entry.day}.`;
    render();
  } catch (error) {
    $('msg').className = 'err';
    $('msg').textContent = `Undo failed: ${error.message}`;
  } finally {
    $('undoEntry').disabled = false;
  }
}

$('loginBtn').addEventListener('click', login);
$('password').addEventListener('keydown', event => { if (event.key === 'Enter') login(); });
$('logout').addEventListener('click', logout);
$('fetchJournal').addEventListener('click', loadJournal);
$('refresh').addEventListener('click', loadJournal);
$('body').addEventListener('paste', handleImagePaste);
$('addEntry').addEventListener('click', addEmptyEntry);
$('imageInput').addEventListener('change', async () => {
  const files = Array.from($('imageInput').files);
  if (!files.length) return;

  if (files.some(file => !file.type.startsWith('image/'))) {
    $('msg').className = 'err';
    $('msg').textContent = 'Only image files are allowed.';
    $('imageInput').value = '';
    return;
  }

  $('msg').className = '';
  $('msg').textContent = `Uploading ${files.length} image${files.length === 1 ? '' : 's'} to CDN...`;
  try {
    await uploadImages(files);
    $('imageInput').value = '';
    $('msg').className = 'ok';
    $('msg').textContent = 'Image uploaded to CDN and Markdown link inserted.';
  } catch (error) {
    $('msg').className = 'err';
    $('msg').textContent = error.message;
  }
});
$('save').addEventListener('click', saveEntry);
$('deleteEntry').addEventListener('click', deleteEntry);
$('undoEntry').addEventListener('click', undoEntry);
$('toggleLayout').addEventListener('click', () => {
  $('editorLayout').classList.toggle('split');
  $('toggleLayout').textContent = $('editorLayout').classList.contains('split') ? 'Stacked View' : 'Split View';
});
$('toggleView').addEventListener('click', () => {
  renderedView = !renderedView;
  $('toggleView').textContent = renderedView ? 'Show Markdown Code' : 'Show Rendered Preview';
  render();
});
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(activeEntryMarkdown());
  $('msg').className = 'ok';
  $('msg').textContent = 'Markdown copied.';
});
async function downloadJournal() {
  const button = $('download');
  button.disabled = true;
  $('msg').className = '';
  $('msg').textContent = 'Fetching latest JOURNAL.md...';
  try {
    const data = await api('/api/journal');
    currentMarkdown = data.content || '';
    const url = URL.createObjectURL(new Blob([currentMarkdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'JOURNAL.md';
    link.click();
    URL.revokeObjectURL(url);
    $('msg').className = 'ok';
    $('msg').textContent = 'Latest JOURNAL.md downloaded.';
  } catch (error) {
    $('msg').className = 'err';
    $('msg').textContent = `Download failed: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}
$('download').addEventListener('click', downloadJournal);
['writer', 'day', 'date', 'hours', 'body', 'links'].forEach(id => $(id).addEventListener('input', () => {
  updateActiveEntryFromForm();
  render();
  scheduleDraftSave();
}));

async function initialize() {
  if (!getToken()) {
    $('login').classList.remove('hidden');
    return;
  }

  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('logout').classList.remove('hidden');
  await loadJournal();
}

window.addEventListener('DOMContentLoaded', () => {
  initialize().catch(logout);
});
