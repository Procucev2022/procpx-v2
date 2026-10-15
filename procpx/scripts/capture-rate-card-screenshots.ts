// scripts/capture-rate-card-screenshots.ts
import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DEBUG_PORT = 9224;
const ARTIFACTS_DIR = 'C:\\Users\\Lenovo\\.gemini\\antigravity-ide\\brain\\10150d0a-bb23-426d-9f85-5bf099b06ee4';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeRequest(options: any, postData?: string): Promise<{ statusCode: number; headers: any; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 200,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function loginUser(email: string): Promise<string[]> {
  const csrfRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/csrf',
    method: 'GET',
  });
  const csrfToken = JSON.parse(csrfRes.body).csrfToken;
  const initialCookies = (csrfRes.headers['set-cookie'] || []).map((c: string) => c.split(';')[0]);

  const postData = new URLSearchParams({
    csrfToken,
    email,
    password: 'Demo@1234',
    redirect: 'false',
    callbackUrl: 'http://localhost:3000/dashboard',
  }).toString();

  const signinRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/callback/credentials?',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        Cookie: initialCookies.join('; '),
      },
    },
    postData
  );

  const signinCookies = (signinRes.headers['set-cookie'] || []).map((c: string) => c.split(';')[0]);
  return [...initialCookies, ...signinCookies];
}

async function run() {
  console.log('Logging in Category Manager and Vendor...');
  const cmCookies = await loginUser('category.manager@procucev-demo.local');
  const vendorCookies = await loginUser('vendor.apex@apex-infra.com');

  const tempProfileDir = path.join(process.cwd(), 'temp-edge-profile-ss');
  if (!fs.existsSync(tempProfileDir)) fs.mkdirSync(tempProfileDir, { recursive: true });

  const edgeProc = spawn(
    EDGE_PATH,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--headless=new',
      '--disable-gpu',
      `--user-data-dir=${tempProfileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { detached: false }
  );

  let versionData = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const res = await makeRequest({
        hostname: 'localhost',
        port: DEBUG_PORT,
        path: '/json/version',
        method: 'GET',
      });
      versionData = JSON.parse(res.body);
      break;
    } catch {}
  }

  if (!versionData || !versionData.webSocketDebuggerUrl) {
    throw new Error('Edge debugger failed to start');
  }

  const targetsRes = await makeRequest({
    hostname: 'localhost',
    port: DEBUG_PORT,
    path: '/json/list',
    method: 'GET',
  });
  const targets = JSON.parse(targetsRes.body);
  const pageTarget = targets.find((t: any) => t.type === 'page') || targets[0];

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res) => (ws.onopen = res));

  let msgId = 1;
  function sendCdp(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve) => {
      const id = msgId++;
      const handler = (event: any) => {
        const msg = JSON.parse(event.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await sendCdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const c of cmCookies) {
    const [name, ...val] = c.split('=');
    await sendCdp('Network.setCookie', {
      name: name.trim(),
      value: val.join('=').trim(),
      domain: 'localhost',
      path: '/',
    });
  }

  console.log('Navigating to /procurement/rate-cards...');
  await sendCdp('Page.navigate', { url: 'http://localhost:3000/procurement/rate-cards' });
  await sleep(3500);

  // 1. Negotiation Tab
  console.log('Capturing: Negotiation Tab...');
  await sendCdp('Runtime.evaluate', {
    expression: `
      const tabBtn = document.getElementById('tab-btn-negotiation');
      if (tabBtn) tabBtn.click();
    `,
  });
  await sleep(1500);

  const shot1 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'rate_card_negotiation_table.png'), Buffer.from(shot1.data, 'base64'));
  console.log('✓ Saved rate_card_negotiation_table.png');

  // 2. Initiating Tab
  console.log('Capturing: Initiating Tab...');
  await sendCdp('Runtime.evaluate', {
    expression: `
      const initBtn = document.getElementById('tab-btn-initiating');
      if (initBtn) initBtn.click();
    `,
  });
  await sleep(1000);
  // Select vendor and category in initiating form to show populated BOQ table
  await sendCdp('Runtime.evaluate', {
    expression: `
      const vendorSelect = document.querySelectorAll('select')[0];
      if (vendorSelect && vendorSelect.options.length > 1) {
        vendorSelect.selectedIndex = 1;
        vendorSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const catSelect = document.querySelectorAll('select')[1];
      if (catSelect && catSelect.options.length > 1) {
        catSelect.selectedIndex = 1;
        catSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    `,
  });
  await sleep(2000);

  const shot2 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'rate_card_initiating_tab.png'), Buffer.from(shot2.data, 'base64'));
  console.log('✓ Saved rate_card_initiating_tab.png');

  // 3. Sign Off Tab
  console.log('Capturing: Sign Off Tab...');
  await sendCdp('Runtime.evaluate', {
    expression: `
      const signOffBtn = document.getElementById('tab-btn-signoff');
      if (signOffBtn) signOffBtn.click();
    `,
  });
  await sleep(1500);

  const shot3 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'rate_card_signoff_tab.png'), Buffer.from(shot3.data, 'base64'));
  console.log('✓ Saved rate_card_signoff_tab.png');

  // 4. Accept Final Offer Modal
  console.log('Capturing: Accept Final Vendor Offer Modal...');
  await sendCdp('Runtime.evaluate', {
    expression: `
      const tabBtn = document.getElementById('tab-btn-negotiation');
      if (tabBtn) tabBtn.click();
    `,
  });
  await sleep(1000);
  await sendCdp('Runtime.evaluate', {
    expression: `
      const acceptBtn = document.getElementById('btn-accept-final-vendor-offer');
      if (acceptBtn) {
        acceptBtn.disabled = false;
        acceptBtn.click();
      }
    `,
  });
  await sleep(1200);

  const shot4 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'rate_card_final_offer_modal.png'), Buffer.from(shot4.data, 'base64'));
  console.log('✓ Saved rate_card_final_offer_modal.png');

  // 5. Vendor Portal
  console.log('Capturing: Vendor Portal...');
  await sendCdp('Network.clearBrowserCookies');
  for (const c of vendorCookies) {
    const [name, ...val] = c.split('=');
    await sendCdp('Network.setCookie', {
      name: name.trim(),
      value: val.join('=').trim(),
      domain: 'localhost',
      path: '/',
    });
  }
  await sendCdp('Page.navigate', { url: 'http://localhost:3000/vendor-portal/rate-cards' });
  await sleep(3000);

  const shot5 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'rate_card_vendor_portal.png'), Buffer.from(shot5.data, 'base64'));
  console.log('✓ Saved rate_card_vendor_portal.png');

  try {
    edgeProc.kill();
  } catch {}

  console.log('All screenshots captured successfully!');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
