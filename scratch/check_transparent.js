const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const imgPath = path.join(__dirname, '../Juego_Spinosaurio/logo-agencia.png');
const buffer = fs.readFileSync(imgPath);

// Parse PNG chunks to get IDAT data
let offset = 8; // skip signature
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

const compressedIdat = Buffer.concat(idatBuffers);
const decompressed = zlib.inflateSync(compressedIdat);

console.log(`Decompressed IDAT length: ${decompressed.length}`);
console.log(`Expected length: ${height * (1 + width * 4)}`);

// Let's count how many pixels are transparent (alpha < 255)
let transparentPixels = 0;
let opaquePixels = 0;
let rowBytes = 1 + width * 4;

for (let y = 0; y < height; y++) {
  const rowStart = y * rowBytes;
  // skip filter byte at rowStart
  for (let x = 0; x < width; x++) {
    const alphaIndex = rowStart + 1 + x * 4 + 3;
    const alpha = decompressed[alphaIndex];
    if (alpha < 255) {
      transparentPixels++;
    } else {
      opaquePixels++;
    }
  }
}

console.log(`Total pixels: ${width * height}`);
console.log(`Transparent pixels (Alpha < 255): ${transparentPixels}`);
console.log(`Opaque pixels (Alpha == 255): ${opaquePixels}`);
