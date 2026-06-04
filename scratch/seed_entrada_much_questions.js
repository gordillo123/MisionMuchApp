// scratch/seed_entrada_much_questions.js
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function run() {
  console.log('⏳ Iniciando sembrado de preguntas para la Estación 1 (Entrada MUCH)...');

  const connectionConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'mision_much'
  };

  let connection;

  try {
    connection = await mysql.createConnection(connectionConfig);
    console.log('✅ Conectado a MySQL exitosamente.');

    // 1. Actualizar datos de la estación 1
    console.log('⏳ Actualizando configuración de la estación 1...');
    await connection.query(
      `UPDATE estaciones 
       SET nombre = 'Entrada MUCH', 
           descripcion = 'Preguntas de bienvenida al museo', 
           orden = 1, 
           puntos = 10, 
           puntaje_minimo = 6, 
           tipo = 'preguntas', 
           activa = TRUE 
       WHERE id_estacion = 1`
    );
    console.log('✅ Estación 1 configurada como "Entrada MUCH" de tipo "preguntas".');

    // 2. Leer preguntas.json
    const jsonPath = path.join(__dirname, '../entrada-much/preguntas.json');
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`No se encontró preguntas.json en: ${jsonPath}`);
    }
    const questions = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`📖 Se leyeron ${questions.length} preguntas de preguntas.json.`);

    // 3. Eliminar preguntas previas de la estación 1 (para evitar duplicados al re-ejecutar)
    console.log('⏳ Limpiando preguntas anteriores de la estación 1...');
    await connection.query('DELETE FROM preguntas WHERE id_estacion = 1');
    console.log('✅ Base de datos limpia de preguntas previas para la estación 1.');

    // 4. Insertar preguntas y respuestas
    console.log('⏳ Insertando preguntas y sus opciones...');
    for (const q of questions) {
      const qText = q.text || q.pregunta || q.enunciado;
      
      // Insertar pregunta
      const [qResult] = await connection.query(
        'INSERT INTO preguntas (id_estacion, pregunta, activa) VALUES (1, ?, TRUE)',
        [qText]
      );
      const insertedQuestionId = qResult.insertId;

      // Insertar respuestas
      const options = q.options || [];
      const correctIndex = q.correctIndex !== undefined ? q.correctIndex : 0;

      for (let i = 0; i < options.length; i++) {
        const optionText = options[i];
        const isCorrect = i === correctIndex;
        
        await connection.query(
          'INSERT INTO respuestas (id_pregunta, texto_respuesta, es_correcta, activa) VALUES (?, ?, ?, TRUE)',
          [insertedQuestionId, optionText, isCorrect]
        );
      }
    }

    console.log(`🎉 ¡Sembrado completado con éxito! Se insertaron ${questions.length} preguntas con sus opciones.`);

  } catch (error) {
    console.error('❌ Error durante el sembrado de preguntas:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexión a MySQL cerrada.');
    }
  }
}

run();
