import * as path from 'path';

process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(process.cwd(), '.playwright-browsers');

async function main() {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const cdp = await context.newCDPSession(page);

  let workerThrottled = false;
  // Listen for worker targets
  cdp.on('Target.attachedToTarget', async (event: unknown) => {
    const e = event as { sessionId: string; targetInfo: { type: string; url: string } };
    console.log('Attached to target:', e.targetInfo.type, e.targetInfo.url);
    if (e.targetInfo.type === 'worker') {
      try {
        await cdp.send('Target.sendMessageToTarget', {
          sessionId: e.sessionId,
          message: JSON.stringify({
            id: 1,
            method: 'Emulation.setCPUThrottlingRate',
            params: { rate: 4 },
          }),
        });
        console.log('Emulation.setCPUThrottlingRate sent to worker!');
        workerThrottled = true;
      } catch (err: unknown) {
        console.log('Worker throttle failed:', (err as Error).message);
      }
    }
  });

  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto('http://127.0.0.1:4173/index.html');
  await page.waitForFunction(
    () => {
      const app = (window as unknown as { __teachingViewerApp?: { getComputeResult: () => unknown } })
        .__teachingViewerApp;
      return app && app.getComputeResult() !== null;
    },
    { timeout: 60000 },
  );

  console.log('Worker throttled during compute?:', workerThrottled);
  await browser.close();
}

main().catch(console.error);
