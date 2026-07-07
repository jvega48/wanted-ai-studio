/**
 * Generates all required icon formats from resources/icon.svg
 * Run once before packaging: node scripts/generate-icons.mjs
 *
 * Requires: pnpm add -D sharp @electron/rebuild (already in devDeps)
 */

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RESOURCES = join(ROOT, 'resources');
const SVG = readFileSync(join(RESOURCES, 'icon.svg'));

mkdirSync(RESOURCES, { recursive: true });

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

async function generatePNGs() {
  console.log('Generating PNGs...');
  for (const size of SIZES) {
    await sharp(SVG)
      .resize(size, size)
      .png()
      .toFile(join(RESOURCES, `icon-${size}.png`));
    console.log(`  ✓ icon-${size}.png`);
  }
  // Main icon.png at 512px
  await sharp(SVG).resize(512, 512).png().toFile(join(RESOURCES, 'icon.png'));
  console.log('  ✓ icon.png (512×512)');
}

async function generateICO() {
  console.log('Generating icon.ico (Windows)...');
  // ICO format: embed 16, 32, 48, 256 px layers
  // sharp can write a multi-size ICO via the ico format
  const layers = await Promise.all(
    [16, 32, 48, 256].map((size) =>
      sharp(SVG).resize(size, size).png().toBuffer()
    )
  );

  // Build ICO file manually (ICONDIR + ICONDIRENTRYs + image data)
  const numImages = layers.length;
  const ICO_HEADER_SIZE = 6;
  const ICO_ENTRY_SIZE = 16;
  const headerSize = ICO_HEADER_SIZE + numImages * ICO_ENTRY_SIZE;

  const offsets = [];
  let currentOffset = headerSize;
  for (const buf of layers) {
    offsets.push(currentOffset);
    currentOffset += buf.length;
  }

  const totalSize = currentOffset;
  const ico = Buffer.alloc(totalSize);

  // ICONDIR header
  ico.writeUInt16LE(0, 0);       // reserved
  ico.writeUInt16LE(1, 2);       // type: ICO
  ico.writeUInt16LE(numImages, 4); // image count

  const iconSizes = [16, 32, 48, 256];
  for (let i = 0; i < numImages; i++) {
    const entryOffset = ICO_HEADER_SIZE + i * ICO_ENTRY_SIZE;
    const sz = iconSizes[i];
    ico.writeUInt8(sz >= 256 ? 0 : sz, entryOffset);      // width (0 = 256)
    ico.writeUInt8(sz >= 256 ? 0 : sz, entryOffset + 1);  // height
    ico.writeUInt8(0, entryOffset + 2);   // color count
    ico.writeUInt8(0, entryOffset + 3);   // reserved
    ico.writeUInt16LE(1, entryOffset + 4); // color planes
    ico.writeUInt16LE(32, entryOffset + 6); // bits per pixel
    ico.writeUInt32LE(layers[i].length, entryOffset + 8);  // size
    ico.writeUInt32LE(offsets[i], entryOffset + 12);       // offset
  }

  for (let i = 0; i < numImages; i++) {
    layers[i].copy(ico, offsets[i]);
  }

  const { writeFileSync } = await import('fs');
  writeFileSync(join(RESOURCES, 'icon.ico'), ico);
  console.log('  ✓ icon.ico (16, 32, 48, 256px)');
}

async function generateICNS() {
  console.log('Generating icon.icns (macOS)...');
  // ICNS format
  const iconTypes = [
    { osType: 'icp4', size: 16 },
    { osType: 'icp5', size: 32 },
    { osType: 'icp6', size: 64 },
    { osType: 'ic07', size: 128 },
    { osType: 'ic08', size: 256 },
    { osType: 'ic09', size: 512 },
    { osType: 'ic10', size: 1024 },
  ];

  const entries = await Promise.all(
    iconTypes.map(async ({ osType, size }) => {
      const data = await sharp(SVG).resize(size, size).png().toBuffer();
      return { osType, data };
    })
  );

  // Calculate total size: 4 (magic) + 4 (size) + sum of entries
  const entrySize = entries.reduce((sum, e) => sum + 8 + e.data.length, 0);
  const totalSize = 8 + entrySize;
  const icns = Buffer.alloc(totalSize);

  icns.write('icns', 0, 'ascii');       // magic
  icns.writeUInt32BE(totalSize, 4);     // file size

  let pos = 8;
  for (const { osType, data } of entries) {
    icns.write(osType, pos, 'ascii');
    icns.writeUInt32BE(8 + data.length, pos + 4);
    data.copy(icns, pos + 8);
    pos += 8 + data.length;
  }

  const { writeFileSync } = await import('fs');
  writeFileSync(join(RESOURCES, 'icon.icns'), icns);
  console.log('  ✓ icon.icns (16–1024px)');
}

async function main() {
  console.log('\n🎨 Wanted AI Studio — Icon Generator\n');
  try {
    await generatePNGs();
    await generateICO();
    await generateICNS();
    console.log('\n✅ All icons generated in apps/desktop/resources/\n');
    console.log('Now update apps/desktop/package.json build config to add icon paths.');
  } catch (err) {
    console.error('Icon generation failed:', err.message);
    console.error('Make sure sharp is installed: pnpm add -D sharp');
    process.exit(1);
  }
}

main();
