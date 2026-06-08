const http = require('http');

http.get('http://127.0.0.1:3000/api/usuarios/2/perfil', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log('User 2 Profile Stations Progress:');
    console.log(JSON.stringify(json.puntuacion.estaciones, null, 2));
    console.log('\nUser 2 Progress Stats:');
    console.log(JSON.stringify(json.progreso, null, 2));
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
