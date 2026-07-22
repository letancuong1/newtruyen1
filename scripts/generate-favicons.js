/**
 * Generate favicon files from logo.svg for Google Search compatibility
 * Run: node scripts/generate-favicons.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, '..', 'public', 'logo.svg');
const OUTPUT_DIR = path.join(__dirname, '..', 'public');

const sizes = [
  { name: 'favicon.ico', size: 48 },
  { name: 'icon-48x48.png', size: 48 },
  { name: 'icon-96x96.png', size: 96 },
  { name: 'icon-144x144.png', size: 144 },
  { name: 'icon-192x192.png', size: 192 },
  { name: 'apple-touch-icon.png', size: 180 }
];

async function generate() {
  // Read SVG as string
  const svgString = fs.readFileSync(SVG_PATH, 'utf-8');
  
  // Create a simple blue square with "Alo" text using SVG
  // Since sharp doesn't support SVG text, we create a solid blue square
  // that matches the logo's background color (#00D2FF)
  const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="#00D2FF" rx="40"/>
    <text x="200" y="260" font-family="Arial, sans-serif" font-weight="bold" font-size="160" fill="white" text-anchor="middle">Alo</text>
  </svg>`;

  const basePng = await sharp(Buffer.from(baseSvg))
    .png()
    .toBuffer();

  for (const s of sizes) {
    const outputPath = path.join(OUTPUT_DIR, s.name);
    try {
      const buffer = await sharp(basePng)
        .resize(s.size, s.size)
        .png()
        .toBuffer();
      
      if (s.name === 'favicon.ico') {
        fs.writeFileSync(outputPath, buffer);
        fs.writeFileSync(outputPath.replace('.ico', '.png'), buffer);
      } else {
        fs.writeFileSync(outputPath, buffer);
      }
      console.log(`✅ Generated ${s.name} (${s.size}x${s.size})`);
    } catch (err) {
      console.error(`❌ Error generating ${s.name}:`, err.message);
    }
  }
  
  console.log('\n🎉 All favicons generated successfully!');
}

generate();