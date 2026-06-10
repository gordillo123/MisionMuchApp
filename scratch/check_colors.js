const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const imgPath = path.join(__dirname, '../Juego_Spinosaurio/logo-agencia.png');
const buffer = fs.readFileSync(imgPath);

let offset = 8;
let idatBuffers = [];
let width = 0;
let height = 0;

while (offset < buffer.length) {
  const length = buffer.readUInt32BE(offset);
  const type = buffer.toString('ascii', offset + 4, offset + 8);
  const data = buffer.slice(offset + 8, offset + 8 + length);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
  } else if (type === 'IDAT') {
    idatBuffers.push(data);
  } else if (type === 'IEND') {
    break;
  }
  offset += 12 + length;
}

const decompressed = zlib.inflateSync(Buffer.concat(idatBuffers));
const rowBytes = 1 + width * 4;

let samples = [];
for (let y = 0; y < height; y++) {
  const rowStart = y * rowBytes;
  for (let x = 0; x < width; x++) {
    const pixelIndex = rowStart + 1 + x * 4;
    const r = decompressed[pixelIndex];
    const g = decompressed[pixelIndex + 1];
    const b = decompressed[pixelIndex + 2];
    const a = decompressed[pixelIndex + 3];
    
    if (a > 200) { 
      samples.push({x, y, r, g, b, a});
      if (samples.length >= 10) break;
    }
  }
  if (samples.length >= 10) break;
}

console.log('Sample pixels:', samples);
