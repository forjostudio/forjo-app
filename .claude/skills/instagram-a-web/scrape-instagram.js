const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const handle = 'kinepp.valentinabenitez';
const outputDir = path.join(__dirname, 'assets', 'instagram');

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

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

  const result = {
    handle,
    name: null,
    bio: null,
    category: null,
    followers: null,
    following: null,
    posts: null,
    profilePicUrl: null,
    linkInBio: null,
    postImages: []
  };

  try {
    await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Extract from meta tags (most reliable)
    const metas = await page.evaluate(() => {
      const metas = {};
      document.querySelectorAll('meta').forEach(m => {
        const prop = m.getAttribute('property') || m.getAttribute('name');
        if (prop) metas[prop] = m.getAttribute('content');
      });
      return metas;
    });

    // og:title usually has "Name (@handle)"
    if (metas['og:title']) {
      const titleMatch = metas['og:title'].match(/^(.+?)\s*\(@/);
      if (titleMatch) result.name = titleMatch[1].trim();
    }

    // og:description: "X Followers, Y Following, Z Posts - See Instagram photos..."
    if (metas['og:description']) {
      const desc = metas['og:description'];
      const followersMatch = desc.match(/([\d,\.]+[KkMm]?)\s*[Ff]ollowers?/);
      const followingMatch = desc.match(/([\d,\.]+[KkMm]?)\s*[Ff]ollowing/);
      const postsMatch = desc.match(/([\d,\.]+[KkMm]?)\s*[Pp]osts?/);
      if (followersMatch) result.followers = followersMatch[1];
      if (followingMatch) result.following = followingMatch[1];
      if (postsMatch) result.posts = postsMatch[1];

      // Bio is after the dash
      const bioMatch = desc.match(/\d+\s*Posts?\s*[-–]\s*(.+)/s);
      if (bioMatch) result.bio = bioMatch[1].trim();
    }

    if (metas['og:image']) result.profilePicUrl = metas['og:image'];

    // Try to get more data from page JSON (Instagram embeds data)
    const pageData = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[type="application/json"]'));
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent);
          return JSON.stringify(data).substring(0, 5000);
        } catch(e) {}
      }
      // Also try window._sharedData
      try { return JSON.stringify(window._sharedData || {}).substring(0, 5000); } catch(e) {}
      return null;
    });

    // Try getting profile from page text
    const pageText = await page.evaluate(() => document.body.innerText.substring(0, 3000));

    // Extract category from page
    const categoryMatch = pageText.match(/\n([^\n]{3,50})\n.*?[Ff]ollower/);
    if (categoryMatch && !result.category) result.category = categoryMatch[1].trim();

    // Get post images from grid
    const imageUrls = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs
        .map(img => ({ src: img.src, alt: img.alt, width: img.naturalWidth || img.width }))
        .filter(img => img.src && img.src.includes('instagram') && img.width > 100)
        .slice(0, 20);
    });

    // Filter likely post images (not profile pic)
    const postImgUrls = imageUrls
      .filter(img => img.src !== result.profilePicUrl)
      .slice(0, 9);

    result.postImages = postImgUrls.map(i => i.src);

    // Download profile pic
    if (result.profilePicUrl) {
      try {
        await downloadImage(result.profilePicUrl, path.join(outputDir, 'profile.jpg'));
        console.log('Downloaded: profile.jpg');
      } catch(e) { console.log('Error downloading profile pic:', e.message); }
    }

    // Download post images
    for (let i = 0; i < result.postImages.length; i++) {
      try {
        await downloadImage(result.postImages[i], path.join(outputDir, `post-${i+1}.jpg`));
        console.log(`Downloaded: post-${i+1}.jpg`);
      } catch(e) { console.log(`Error downloading post-${i+1}:`, e.message); }
    }

    result.downloadedPosts = result.postImages.length;

  } catch(e) {
    console.error('Scraping error:', e.message);
  }

  await browser.close();

  // Save result
  fs.writeFileSync(path.join(__dirname, 'instagram-data.json'), JSON.stringify(result, null, 2));
  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(result, null, 2));
})();
