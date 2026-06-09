const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.instagram.com/'
      }
    }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        downloadImage(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    });
    req.on('error', err => { reject(err); });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();

  // Intercept the actual 320x320 response and save it
  let saved320 = false;
  page.on('response', async response => {
    try {
      const url = response.url();
      if (url.includes('t51.82787-19') && url.includes('s320x320') && !saved320) {
        saved320 = true;
        const buffer = await response.body();
        const dest = path.join(__dirname, 'assets', 'instagram', 'profile-hires.jpg');
        fs.writeFileSync(dest, buffer);
        console.log(`Saved from network: profile-hires.jpg (${Math.round(buffer.length/1024)}KB)`);
      }
    } catch(e) {}
  });

  try {
    await page.goto('https://www.instagram.com/kinepp.valentinabenitez/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    if (!saved320) {
      // Try to get 320x320 from DOM src attribute
      const src320 = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        const found = imgs.find(img => img.src && img.src.includes('t51.82787-19') && img.src.includes('s320x320'));
        return found ? found.src : null;
      });

      if (src320) {
        console.log('Found 320x320 in DOM, downloading...');
        // Use page.goto to download through the browser context
        const imgPage = await context.newPage();
        const response = await imgPage.goto(src320, { timeout: 15000 });
        const buffer = await response.body();
        const dest = path.join(__dirname, 'assets', 'instagram', 'profile-hires.jpg');
        fs.writeFileSync(dest, buffer);
        const stat = fs.statSync(dest);
        console.log(`Saved: profile-hires.jpg (${Math.round(stat.size/1024)}KB)`);
        await imgPage.close();
      } else {
        // Get full URL from page source
        const html = await page.content();
        const match320 = html.match(/https?:\/\/[^\s"'<>]+t51\.82787-19[^\s"'<>]+s320x320[^\s"'<>]+/);
        if (match320) {
          console.log('Found URL in source:', match320[0].substring(0, 80));
          const imgPage = await context.newPage();
          const response = await imgPage.goto(match320[0], { timeout: 15000 });
          const buffer = await response.body();
          const dest = path.join(__dirname, 'assets', 'instagram', 'profile-hires.jpg');
          fs.writeFileSync(dest, buffer);
          const stat = fs.statSync(dest);
          console.log(`Saved: profile-hires.jpg (${Math.round(stat.size/1024)}KB)`);
          await imgPage.close();
        } else {
          console.log('No 320px URL found, checking what sizes are available...');
          const allMatches = html.match(/https?:\/\/[^\s"'<>]+t51\.82787-19[^\s"'<>]+\.jpg[^\s"'<>]*/g) || [];
          const unique = [...new Set(allMatches)];
          unique.forEach(u => {
            const m = u.match(/s(\d+)x(\d+)/);
            if (m) console.log(`  ${m[1]}x${m[2]}: ${u.substring(0, 80)}`);
          });
          // Save biggest available
          let best = null, bestSz = 0;
          unique.forEach(u => {
            const m = u.match(/s(\d+)x(\d+)/);
            if (m && parseInt(m[1]) > bestSz) { bestSz = parseInt(m[1]); best = u; }
          });
          if (best) {
            const imgPage = await context.newPage();
            const response = await imgPage.goto(best, { timeout: 15000 });
            const buffer = await response.body();
            const dest = path.join(__dirname, 'assets', 'instagram', 'profile-hires.jpg');
            fs.writeFileSync(dest, buffer);
            const stat = fs.statSync(dest);
            console.log(`Saved best available (${bestSz}px): profile-hires.jpg (${Math.round(stat.size/1024)}KB)`);
            await imgPage.close();
          }
        }
      }
    }

  } catch(e) {
    console.error('Error:', e.message);
  }

  await browser.close();
})();
