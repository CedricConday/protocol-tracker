const sharp = require('sharp');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const BG = '#0d0d0d';
const GREEN = '#22c55e';

async function generateIcon(size) {
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${BG}" />
    <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.38}" fill="${GREEN}" />
    <text x="${size / 2}" y="${size * 0.62}" text-anchor="middle"
          font-family="system-ui, sans-serif" font-size="${size * 0.5}" font-weight="800"
          fill="#ffffff">C</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generateSplash(width, height) {
  const logoSize = Math.min(width, height) * 0.25;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${BG}" />
    <circle cx="${width / 2}" cy="${height * 0.42}" r="${logoSize * 0.8}" fill="${GREEN}" />
    <text x="${width / 2}" y="${height * 0.42 + logoSize * 0.35}" text-anchor="middle"
          font-family="system-ui, sans-serif" font-size="${logoSize * 1.1}" font-weight="800"
          fill="#ffffff">C</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  // Icon 1024x1024
  const iconBuf = await generateIcon(1024);
  await sharp(iconBuf).resize(1024, 1024).png().toFile(path.join(ASSETS_DIR, 'icon.png'));
  console.log('✓ Generated icon.png (1024x1024)');

  // Adaptive icon (Android) 1024x1024
  await sharp(iconBuf).resize(1024, 1024).png().toFile(path.join(ASSETS_DIR, 'adaptive-icon.png'));
  console.log('✓ Generated adaptive-icon.png (1024x1024)');

  // Splash 1284x2778
  const splashBuf = await generateSplash(1284, 2778);
  await sharp(splashBuf).resize(1284, 2778).png().toFile(path.join(ASSETS_DIR, 'splash-icon.png'));
  console.log('✓ Generated splash-icon.png (1284x2778)');

  // Favicon 48x48
  const faviconBuf = await generateIcon(48);
  await sharp(faviconBuf).resize(48, 48).png().toFile(path.join(ASSETS_DIR, 'favicon.png'));
  console.log('✓ Generated favicon.png (48x48)');
}

main().catch((err) => {
  console.error('Asset generation failed:', err);
  process.exit(1);
});
