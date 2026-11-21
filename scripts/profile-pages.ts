import * as path from 'path';

process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(process.cwd(), '.playwright-browsers');

async function profilePage(url: string, pageName: string) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const requests: Array<{
    url: string;
    resourceType: string;
    status: number;
    size: number;
  }> = [];

  page.on('response', async (response) => {
    let size = 0;
    try {
      const buffer = await response.body();
      size = buffer.length;
    } catch {
      // response body might not be available
    }
    requests.push({
      url: response.url(),
      resourceType: response.request().resourceType(),
      status: response.status(),
      size,
    });
  });

  console.log(`\n========================================`);
  console.log(`PROFILING: ${pageName} (${url}) under 4x CPU throttle`);
  console.log(`========================================`);

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  const tCommit = Date.now() - t0;

  await page.waitForLoadState('domcontentloaded');
  const tDcl = Date.now() - t0;

  await page.waitForLoadState('load');
  const tLoad = Date.now() - t0;

  // Test interactive readiness: synthetic clicks committing a line
  let interactiveMs = 0;
  if (pageName === 'draft.html') {
    const canvas = page.locator('#draft-canvas');
    await canvas.waitFor({ state: 'visible' });

    // Click point 1 then point 2
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + 100, box.y + 100);
      await page.mouse.click(box.x + 200, box.y + 100);
      await page.waitForFunction(() => {
        const app = (window as unknown as { __draftApp?: { engine: { getEntities: () => unknown[] } } }).__draftApp;
        return app && app.engine.getEntities().length > 0;
      }, { timeout: 30000 });
      interactiveMs = Date.now() - t0;
    }
  } else if (pageName === 'student.html') {
    await page.waitForSelector('#app', { state: 'visible' });
    interactiveMs = Date.now() - t0;
  }

  console.log(`Commit Time:        ${tCommit} ms`);
  console.log(`DOMContentLoaded:   ${tDcl} ms`);
  console.log(`Window Load:        ${tLoad} ms`);
  console.log(`First Interactive:  ${interactiveMs} ms`);
  console.log(`\nNetwork Requests (${requests.length} total):`);
  let totalBytes = 0;
  for (const r of requests) {
    totalBytes += r.size;
    const urlClean = r.url.replace(/^http:\/\/127\.0\.0\.1:4173/, '');
    console.log(`  [${r.resourceType}] ${r.status} ${urlClean} (${(r.size / 1024).toFixed(2)} KB)`);
  }
  console.log(`Total Download Size: ${(totalBytes / 1024).toFixed(2)} KB`);

  // Check if any OCCT or worker was loaded
  const occtLoaded = requests.some(r => r.url.includes('occt') || r.url.includes('.wasm') || r.resourceType === 'worker');
  console.log(`OCCT / Worker / WASM Loaded: ${occtLoaded ? 'YES (WARNING)' : 'NO (CLEAN)'}`);

  await browser.close();
  return { pageName, tCommit, tDcl, tLoad, interactiveMs, requests, occtLoaded };
}

async function main() {
  await profilePage('http://127.0.0.1:4173/draft.html', 'draft.html');
  await profilePage('http://127.0.0.1:4173/student.html', 'student.html');
}

main().catch(console.error);
