const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DEBUG_PORT = 9222;

async function run() {
  console.log('1. Authenticating to obtain session cookie...');
  const csrfRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/csrf',
    method: 'GET'
  });
  const csrfToken = JSON.parse(csrfRes.body).csrfToken;
  const cookies = (csrfRes.headers['set-cookie'] || []).map(c => c.split(';')[0]);

  const postData = new URLSearchParams({
    csrfToken: csrfToken,
    email: 'category.manager@procucev-demo.local',
    password: 'Demo@1234',
    redirect: 'false',
    callbackUrl: 'http://localhost:3000/dashboard'
  }).toString();

  const signinRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/callback/credentials?',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      'Cookie': cookies.join('; ')
    }
  }, postData);

  const signinCookies = (signinRes.headers['set-cookie'] || []).map(c => c.split(';')[0]);
  const allCookies = [...cookies, ...signinCookies];
  console.log('Got session cookies count:', allCookies.length);

  // Parse session token cookie
  const cookieObjects = allCookies.map(c => {
    const [name, ...rest] = c.split('=');
    return {
      name: name.trim(),
      value: rest.join('=').trim(),
      domain: 'localhost',
      path: '/'
    };
  });

  console.log('2. Launching headless Edge on debug port', DEBUG_PORT);
  const tempProfileDir = path.join(process.cwd(), 'temp-edge-profile');
  if (!fs.existsSync(tempProfileDir)) fs.mkdirSync(tempProfileDir, { recursive: true });

  const edgeProc = spawn(EDGE_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    `--user-data-dir=${tempProfileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { detached: false });

  edgeProc.stderr.on('data', d => {});

  // Wait for Edge CDP to be ready
  let versionData = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const res = await makeRequest({
        hostname: 'localhost',
        port: DEBUG_PORT,
        path: '/json/version',
        method: 'GET'
      });
      versionData = JSON.parse(res.body);
      break;
    } catch (e) {}
  }

  if (!versionData || !versionData.webSocketDebuggerUrl) {
    throw new Error('Edge CDP not responding');
  }

  console.log('Edge CDP ready. Getting targets...');
  const targetsRes = await makeRequest({
    hostname: 'localhost',
    port: DEBUG_PORT,
    path: '/json/list',
    method: 'GET'
  });
  const targets = JSON.parse(targetsRes.body);
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  console.log('Target WebSocket URL:', pageTarget.webSocketDebuggerUrl);

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(res => ws.onopen = res);

  let msgId = 1;
  function sendCdp(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      const handler = (event) => {
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

  console.log('3. Enabling CDP domains and setting cookies...');
  await sendCdp('Network.enable');
  await sendCdp('Page.enable');
  await sendCdp('DOM.enable');

  for (const c of cookieObjects) {
    await sendCdp('Network.setCookie', c);
  }

  // Set desktop viewport
  console.log('4. Setting desktop viewport 1440x900...');
  await sendCdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  const vendorUrl = 'http://localhost:3000/procurement/vendors/b79ac9af-7c2b-43be-9a78-571e49daa3fb';
  console.log('5. Navigating to:', vendorUrl);
  await sendCdp('Page.navigate', { url: vendorUrl });

  // Wait for network idle and rendering
  console.log('Waiting for render and API fetch (4 seconds)...');
  await sleep(4000);

  // Take desktop screenshot
  console.log('6. Capturing desktop screenshot...');
  const desktopShot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const desktopPath = path.join(process.cwd(), 'scripts', 'desktop_preview.png');
  fs.writeFileSync(desktopPath, Buffer.from(desktopShot.data, 'base64'));
  console.log('Saved desktop screenshot to:', desktopPath);

  // Set tablet/mobile viewport
  console.log('7. Setting mobile/tablet viewport 768x1024...');
  await sendCdp('Emulation.setDeviceMetricsOverride', {
    width: 768,
    height: 1024,
    deviceScaleFactor: 1,
    mobile: true
  });
  await sleep(1000);
  const mobileShot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const mobilePath = path.join(process.cwd(), 'scripts', 'mobile_preview.png');
  fs.writeFileSync(mobilePath, Buffer.from(mobileShot.data, 'base64'));
  console.log('Saved mobile screenshot to:', mobilePath);

  // Close browser and cleanup
  ws.close();
  edgeProc.kill('SIGKILL');
  console.log('Done! Both screenshots captured successfully.');
}

function makeRequest(options, postBody = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (postBody) req.write(postBody);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

run().catch(err => {
  console.error('Screenshot error:', err);
  process.exit(1);
});
