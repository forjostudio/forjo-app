const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        downloadImage(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();

  // Collect all image requests to find large profile pic
  const imageRequests = [];
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('cdninstagram') || url.includes('fbcdn.net')) {
      if (url.includes('t51.82787-19') || url.includes('profile')) {
        imageRequests.push(url);
      }
    }
  });

  try {
    await page.goto('https://www.instagram.com/kinepp.valentinabenitez/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Find all profile-related images in DOM
    const profileImgs = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs
        .map(img => ({ src: img.src, alt: img.alt || '', width: img.naturalWidth, height: img.naturalHeight }))
        .filter(img => img.src && img.src.includes('t51.82787-19'))
        .sort((a, b) => b.width - a.width);
    });

    console.log('Profile images found in DOM:');
    profileImgs.forEach(img => console.log(`  ${img.width}x${img.height}: ${img.src.substring(0, 100)}...`));

    // Also try to find larger versions in page source
    const pageContent = await page.content();
    const largePicMatches = pageContent.match(/https?:\/\/[^"']+t51\.82787-19[^"']+\.jpg[^"']*/g);
    if (largePicMatches) {
      const uniqueUrls = [...new Set(largePicMatches)];
      console.log('\nAll profile pic URLs from source:');
      uniqueUrls.forEach(u => {
        const sizeMatch = u.match(/s(\d+)x(\d+)/);
        if (sizeMatch) console.log(`  ${sizeMatch[1]}x${sizeMatch[2]}: ${u.substring(0, 120)}`);
      });

      // Find the largest one
      let bestUrl = null;
      let bestSize = 0;
      uniqueUrls.forEach(u => {
        const sizeMatch = u.match(/s(\d+)x(\d+)/);
        if (sizeMatch) {
          const size = parseInt(sizeMatch[1]);
          if (size > bestSize) { bestSize = size; bestUrl = u; }
        }
      });

      if (!bestUrl && uniqueUrls.length > 0) bestUrl = uniqueUrls[0];

      if (bestUrl) {
        console.log(`\nBest profile pic URL (${bestSize}px): ${bestUrl.substring(0, 120)}`);
        const dest = path.join(__dirname, 'assets', 'instagram', 'profile-hires.jpg');
        try {
          await downloadImage(bestUrl, dest);
          const stat = fs.statSync(dest);
          console.log(`Downloaded profile-hires.jpg: ${Math.round(stat.size/1024)}KB`);
        } catch(e) { console.log('Download error:', e.message); }
      }
    }

    // Also log captured requests
    if (imageRequests.length > 0) {
      console.log('\nCaptured image requests:');
      imageRequests.slice(0, 5).forEach(u => console.log(' ', u.substring(0, 120)));
    }

  } catch(e) {
    console.error('Error:', e.message);
  }

  await browser.close();
})();
