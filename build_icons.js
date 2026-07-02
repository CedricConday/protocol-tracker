// Generate PNG icons (teal background + white medical cross) with zero deps.
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(size) {
  const bg = [13, 148, 136, 255];   // teal-600
  const fg = [255, 255, 255, 255];  // white cross
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const arm = Math.round(size * 0.18);   // cross thickness / 2
  const len = Math.round(size * 0.30);   // cross arm length from center
  const cx = size / 2, cy = size / 2;
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const inV = Math.abs(x - cx) <= arm && Math.abs(y - cy) <= len;
      const inH = Math.abs(y - cy) <= arm && Math.abs(x - cx) <= len;
      const c = (inV || inH) ? fg : bg;
      raw[p++] = c[0]; raw[p++] = c[1]; raw[p++] = c[2]; raw[p++] = c[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const dir = path.join(__dirname, 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon-180.png', 180], ['icon-maskable-512.png', 512]]) {
  fs.writeFileSync(path.join(dir, name), png(size));
  console.log('wrote', name, size + 'x' + size);
}
