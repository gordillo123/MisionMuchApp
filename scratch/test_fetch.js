const http = require('http');

http.get('http://127.0.0.1:3000/entrada-much/preguntas.json', (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('Parsed JSON count:', parsed.length);
      console.log('First question:', parsed[0]);
    } catch (e) {
      console.error('Failed to parse JSON:', e.message);
      console.log('Raw data sample:', data.substring(0, 200));
    }
  });
}).on('error', (err) => {
  console.error('Error fetching questions:', err.message);
});
