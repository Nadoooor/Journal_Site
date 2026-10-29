const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') {
      const file = path.join(__dirname, '..', url.pathname === '/' ? 'index.html' : url.pathname);
      const type = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
      return route.fulfill({ body: fs.readFileSync(file), contentType: type });
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
    return route.abort();
  });
  await page.goto('http://localhost/');
  await page.evaluate(() => {
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('login').classList.add('hidden');
    selectEntry({ github: 'Nadoooor', day: 1, body: '', links: [] });
  });
});

test('successive clipboard images with the same name have distinct upload identities; identical bytes reuse one', async ({ page }) => {
  const uploads = [];
  await page.route('**/api/upload-image', route => {
    const data = route.request().postDataJSON();
    uploads.push(data);
    return route.fulfill({ json: { path: `https://cdn.example/${data.filename}` } });
  });
  await page.evaluate(async () => {
    for (const color of ['red', 'blue', 'red']) {
      const canvas = document.createElement('canvas');
      canvas.width = 800; canvas.height = 400;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 800, 400);
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      const file = new File([blob], 'image.png', { type: 'image/png' });
      await handleImagePaste({ clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] }, preventDefault() {} });
    }
  });
  expect(uploads).toHaveLength(3);
  expect(uploads[0].filename).not.toBe(uploads[1].filename);
  expect(uploads[0].filename).toBe(uploads[2].filename);
  expect(uploads[0].content).not.toBe(uploads[1].content);
  expect(uploads[0]).not.toHaveProperty('dimensions');
  expect(await page.locator('#body').inputValue()).toContain('width="800" height="400"');
  await page.locator('#toggleView').click();
  await expect(page.locator('#renderedPreview img[src^="https://cdn.example/"]')).toHaveCount(3);
});

test('image bounds preserve portrait, landscape and small sizes', async ({ page }) => {
  const sizes = await page.evaluate(() => [
    fitImageDimensions(2400, 1200, {width:1280,height:1280}),
    fitImageDimensions(1200, 2400, {width:1280,height:1280}),
    fitImageDimensions(100, 50, {width:1280,height:1280}),
    fitImageDimensions(2400, 1200, {width:600,height:200})
  ]);
  expect(sizes).toEqual([{width:1280,height:640},{width:640,height:1280},{width:100,height:50},{width:400,height:200}]);
});

test('Markdown supports code, tables, nested lists, badges and safe HTML images', async ({ page }) => {
  await page.locator('#body').fill('> Quote\n\n1. first\n   - nested\n\n```js\nconst x = "<img> **literal**";\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n<img height="200" alt="A &amp; B" src="photos/a%20b.png?x=1&amp;y=2" width="400">');
  await page.locator('#toggleView').click();
  await expect(page.locator('#renderedPreview blockquote')).toContainText('Quote');
  await expect(page.locator('#renderedPreview ol ul li')).toHaveText('nested');
  await expect(page.locator('#renderedPreview pre code')).toContainText('<img> **literal**');
  await expect(page.locator('#renderedPreview table td')).toHaveCount(2);
  await expect(page.locator('#renderedPreview h2 a img')).toHaveCount(1);
  await expect(page.locator('#renderedPreview img[alt="A & B"]')).toHaveAttribute('src', 'https://raw.githubusercontent.com/WALL-Es/WALL-E/main/photos/a%20b.png?x=1&y=2');
});

test('unsafe preview markup is removed and code remains literal', async ({ page }) => {
  await page.locator('#body').fill('<script>window.pwned=1</script>\n\n<img src="x" onerror="window.pwned=1">\n\n<a href="javascript:alert(1)">bad</a>\n\n<iframe src="https://evil.example"></iframe>\n\n`<script>literal</script>`');
  await page.locator('#toggleView').click();
  await expect(page.locator('#renderedPreview script, #renderedPreview iframe, #renderedPreview [onerror], #renderedPreview [href^="javascript:"]')).toHaveCount(0);
  await expect(page.locator('#renderedPreview code')).toHaveText('<script>literal</script>');
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
});

for (const mode of ['modern', 'missing', 'denied', 'failed']) {
  test(`copy handles ${mode} clipboard`, async ({ page }) => {
    await page.evaluate(mode => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: mode === 'missing' ? undefined : {
        writeText: async text => { if (mode !== 'modern') throw new Error('Denied'); window.copied = text; }
      }});
      document.execCommand = () => {
        if (mode === 'failed') return false;
        window.copied = document.activeElement.value;
        return true;
      };
    }, mode);
    await page.locator('#body').fill('Clipboard content');
    await page.locator('#copy').click();
    if (mode === 'failed') {
      await expect(page.locator('#msg')).toContainText('Automatic copy is unavailable');
      expect(await page.evaluate(() => window.getSelection().toString())).toContain('Clipboard content');
    } else {
      await expect(page.locator('#msg')).toHaveText('Markdown copied.');
      expect(await page.evaluate(() => window.copied)).toContain('Clipboard content');
    }
  });
}

test('plain text paste is left to the browser and unreadable images report failure', async ({ page }) => {
  expect(await page.evaluate(async () => {
    let prevented = false;
    await handleImagePaste({ clipboardData: { items: [] }, preventDefault() { prevented = true; } });
    return prevented;
  })).toBe(false);
  await page.evaluate(async () => {
    const file = new File(['invalid'], 'bad.png', { type: 'image/png' });
    await handleImagePaste({ clipboardData: { items: [{kind:'file',type:'image/png',getAsFile:()=>file}] }, preventDefault() {} });
  });
  await expect(page.locator('#msg')).toContainText('Could not decode');
  await expect(page.locator('#cdnStatus')).toHaveClass('process-item error');
});

test('file picker uses display bounds and preview images fit a narrow screen', async ({ page }) => {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 800;
    return canvas.toDataURL().split(',')[1];
  });
  const bytes = Buffer.from(png, 'base64');
  await page.route('**/api/upload-image', route => route.fulfill({ json: { path: 'https://cdn.example/photo.png' } }));
  await page.route('https://cdn.example/photo.png', route => route.fulfill({ body: bytes, contentType: 'image/png' }));
  await page.locator('#imageWidth').fill('600');
  await page.locator('#imageHeight').fill('200');
  await page.locator('#imageInput').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: bytes });
  await expect(page.locator('#body')).toHaveValue(/width="400" height="200"/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#toggleView').click();
  const image = page.locator('#renderedPreview img[alt="photo.png"]');
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(image => image.naturalWidth)).toBe(1600);
  const size = await image.evaluate(image => ({ width: image.clientWidth, height: image.clientHeight, parent: image.parentElement.clientWidth }));
  expect(size.width).toBeLessThanOrEqual(size.parent);
  expect(Math.abs(size.width / size.height - 2)).toBeLessThan(.03);
});
