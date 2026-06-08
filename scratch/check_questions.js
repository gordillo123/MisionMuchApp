const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    database: process.env.DB_DATABASE || 'mision_much',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    const [questions] = await connection.query('SELECT * FROM preguntas WHERE id_estacion = 1');
    console.log(`Found ${questions.length} questions for Station 1 in DB:`);
    for (const q of questions) {
      const [answers] = await connection.query('SELECT * FROM respuestas WHERE id_pregunta = ?', [q.id_pregunta]);
      console.log(`\nQuestion ID ${q.id_pregunta}: ${q.pregunta}`);
      answers.forEach(a => {
        console.log(` - [${a.es_correcta ? 'X' : ' '}] ${a.texto_respuesta}`);
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await connection.end();
  }
}

run();
