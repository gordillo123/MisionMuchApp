const fetch = require('node-fetch'); // node-fetch might not be installed, let's use http module
const http = require('http');

http.get('http://127.0.0.1:3000/api/estaciones', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Active stations from /api/estaciones API:');
    console.log(JSON.stringify(JSON.parse(data), null, 2));
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
