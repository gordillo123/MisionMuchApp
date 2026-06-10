const fs = require('fs');
const path = require('path');

const imgPath = path.join(__dirname, '../Juego_Spinosaurio/logo-agencia.png');
if (!fs.existsSync(imgPath)) {
  console.log('File does not exist:', imgPath);
  process.exit(1);
}

const buffer = fs.readFileSync(imgPath);
// Check PNG signature
if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47) {
  console.log('Not a PNG file');
  process.exit(1);
}

console.log('PNG File Size:', buffer.length);
// Read IHDR chunk (starts at offset 8, length is 4 bytes, chunk type is 'IHDR' (4 bytes), then 13 bytes of data)
const width = buffer.readUInt32BE(16);
const height = buffer.readUInt32BE(20);
const bitDepth = buffer[24];
const colorType = buffer[25];
const compression = buffer[26];
const filter = buffer[27];
const interlace = buffer[28];

console.log(`Dimensions: ${width}x${height}`);
console.log(`Bit depth: ${bitDepth}`);
console.log(`Color type: ${colorType} (${getColorTypeString(colorType)})`);

function getColorTypeString(type) {
  switch (type) {
    case 0: return 'Grayscale';
    case 2: return 'RGB';
    case 3: return 'Palette';
    case 4: return 'Grayscale + Alpha';
    case 6: return 'RGB + Alpha';
    default: return 'Unknown';
  }
}
