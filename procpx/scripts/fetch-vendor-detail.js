const http = require('http');

async function testFetch() {
  // Step 1: Get CSRF token
  const csrfRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/csrf',
    method: 'GET'
  });

  const csrfData = JSON.parse(csrfRes.body);
  const csrfToken = csrfData.csrfToken;
  console.log('Got CSRF Token:', csrfToken ? 'YES' : 'NO');

  // Collect cookies from csrf response
  let cookies = (csrfRes.headers['set-cookie'] || []).map(c => c.split(';')[0]);

  // Step 2: Post credentials to signin
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

  console.log('Signin Status:', signinRes.statusCode);
  const newCookies = (signinRes.headers['set-cookie'] || []).map(c => c.split(';')[0]);
  const sessionCookies = [...cookies, ...newCookies].join('; ');
  console.log('Session Cookies Present:', sessionCookies.includes('authjs.session-token') || sessionCookies.includes('next-auth.session-token'));

  // Step 3: Fetch Vendor Detail page with session cookie
  const vendorRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/procurement/vendors/b79ac9af-7c2b-43be-9a78-571e49daa3fb',
    method: 'GET',
    headers: {
      'Cookie': sessionCookies
    }
  });

  console.log('Vendor Page Status:', vendorRes.statusCode);
  console.log('Vendor Page Body Length:', vendorRes.body.length);
  const fs = require('fs');
  fs.writeFileSync('scripts/rendered-body.html', vendorRes.body);
  
  // Verify expected sections & classes in rendered HTML
  const checks = [
    ['max-w-[1440px]', vendorRes.body.includes('max-w-[1440px]')],
    ['Vendor Management', vendorRes.body.includes('Vendor Management')],
    ['Vendor Code', vendorRes.body.includes('Vendor Code')],
    ['Vendor Qualification Score', vendorRes.body.includes('Vendor Qualification Score')],
    ['PPO Performance', vendorRes.body.includes('PPO Performance')],
    ['Evaluation Status', vendorRes.body.includes('Evaluation Status')],
    ['tabs and tab-btn', vendorRes.body.includes('tab-btn')],
    ['Legal Identity', vendorRes.body.includes('Legal Identity')],
    ['Contact Information', vendorRes.body.includes('Contact Information')],
    ['Business Profile', vendorRes.body.includes('Business Profile')],
    ['Compliance & References', vendorRes.body.includes('Compliance & References')],
    ['grid-cols-1 lg:grid-cols-2', vendorRes.body.includes('lg:grid-cols-2')],
    ['grid-cols-1 md:grid-cols-3', vendorRes.body.includes('md:grid-cols-3')],
  ];

  console.log('\n--- VERIFICATION CHECKS ---');
  checks.forEach(([name, pass]) => {
    console.log(`${pass ? '✅' : '❌'} ${name}: ${pass}`);
  });
}

function makeRequest(options, postBody = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });
    req.on('error', reject);
    if (postBody) req.write(postBody);
    req.end();
  });
}

testFetch().catch(console.error);
