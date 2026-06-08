-- database/seed_mysql.sql
-- Datos iniciales para "Misión MUCH" en MySQL

-- 1. Insertar Roles básicos
INSERT INTO roles (id_rol, nombre, descripcion) VALUES
(1, 'usuario', 'Usuario regular que juega las estaciones del recorrido'),
(2, 'admin', 'Administrador general del sistema con acceso completo a métricas y registros'),
(3, 'taquilla', 'Operador de taquilla encargado de validar, escanear y canjear boletos')
ON DUPLICATE KEY UPDATE nombre=nombre;

-- 2. Insertar Estaciones de la Misión
INSERT INTO estaciones (id_estacion, nombre, descripcion, orden, puntos, puntaje_minimo, tipo, activa) VALUES
(1, 'Entrada MUCH', 'Preguntas de bienvenida al museo', 1, 10, 6, 'preguntas', 1),
(2, 'Espinosaurio', 'Reto de saltos del Espinosaurio', 2, 15, 15, 'minijuego', 1),
(3, 'Biodiversidad y Conocimiento', 'Preguntas sobre flora y fauna de Chiapas', 3, 10, 7, 'preguntas', 1),
(4, 'Sala de energía', 'Preguntas sobre fuentes y tipos de energía', 4, 10, 7, 'preguntas', 1),
(5, 'Sala de desarrollo sustentable', 'Preguntas sobre desarrollo sustentable y ecotecnias', 5, 10, 7, 'preguntas', 1),
(6, 'SBEEL Dinosaurios', 'Armado del rompecabezas SBEEL de dinosaurios', 6, 10, 10, 'rompecabezas', 1)
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), descripcion=VALUES(descripcion), tipo=VALUES(tipo), puntos=VALUES(puntos), puntaje_minimo=VALUES(puntaje_minimo);

-- 3. Insertar Preguntas para la Sala de desarrollo sustentable (id_estacion = 5)
INSERT INTO preguntas (id_pregunta, id_estacion, pregunta, activa) VALUES
(1, 5, '¿Qué es el desarrollo sustentable?', 1),
(2, 5, '¿Cuál de las siguientes es una fuente de energía renovable?', 1),
(3, 5, '¿Qué significan las 3R en el cuidado del medio ambiente?', 1)
ON DUPLICATE KEY UPDATE pregunta=VALUES(pregunta), id_estacion=VALUES(id_estacion);

-- Respuestas para Pregunta 1
INSERT INTO respuestas (id_respuesta, id_pregunta, texto_respuesta, es_correcta, activa) VALUES
(1, 1, 'Gastar todos los recursos naturales lo más rápido posible.', 0, 1),
(2, 1, 'Satisfacer las necesidades actuales sin comprometer las capacidades de las futuras generaciones.', 1, 1),
(3, 1, 'Ignorar el medio ambiente a favor del desarrollo industrial ilimitado.', 0, 1)
ON DUPLICATE KEY UPDATE texto_respuesta=VALUES(texto_respuesta), es_correcta=VALUES(es_correcta);

-- Respuestas para Pregunta 2
INSERT INTO respuestas (id_respuesta, id_pregunta, texto_respuesta, es_correcta, activa) VALUES
(4, 2, 'El petróleo.', 0, 1),
(5, 2, 'El carbón mineral.', 0, 1),
(6, 2, 'La energía solar.', 1, 1)
ON DUPLICATE KEY UPDATE texto_respuesta=VALUES(texto_respuesta), es_correcta=VALUES(es_correcta);

-- Respuestas para Pregunta 3
INSERT INTO respuestas (id_respuesta, id_pregunta, texto_respuesta, es_correcta, activa) VALUES
(7, 3, 'Reducir, Reutilizar y Reciclar.', 1, 1),
(8, 3, 'Recuperar, Reponer y Reparar.', 0, 1),
(9, 3, 'Rentar, Regalar y Recibir.', 0, 1)
ON DUPLICATE KEY UPDATE texto_respuesta=VALUES(texto_respuesta), es_correcta=VALUES(es_correcta);


-- 4. Insertar Preguntas para la Sala de energía (id_estacion = 4)
INSERT INTO preguntas (id_pregunta, id_estacion, pregunta, activa) VALUES
(4, 4, '¿Qué recursos son hoy esenciales para cualquier persona, según la sala de energía?', 1),
(5, 4, '¿Qué orgánulos celulares fabrican azúcares en las plantas gracias a la energía solar?', 1),
(6, 4, '¿Qué máquina simple es el tornillo de Arquímedes?', 1)
ON DUPLICATE KEY UPDATE pregunta=VALUES(pregunta);

-- Respuestas para Pregunta 4
INSERT INTO respuestas (id_respuesta, id_pregunta, texto_respuesta, es_correcta, activa) VALUES
(10, 4, 'Gasolina y carbón.', 0, 1),
(11, 4, 'Electricidad y agua.', 1, 1),
(12, 4, 'Petróleo y leña.', 0, 1)
ON DUPLICATE KEY UPDATE texto_respuesta=VALUES(texto_respuesta), es_correcta=VALUES(es_correcta);

-- Respuestas para Pregunta 5
INSERT INTO respuestas (id_respuesta, id_pregunta, texto_respuesta, es_correcta, activa) VALUES
(13, 5, 'Cloroplastos.', 1, 1),
(14, 5, 'Mitocondrias.', 0, 1),
(15, 5, 'Ribosomas.', 0, 1)
ON DUPLICATE KEY UPDATE texto_respuesta=VALUES(texto_respuesta), es_correcta=VALUES(es_correcta);

-- Respuestas para Pregunta 6
INSERT INTO respuestas (id_respuesta, id_pregunta, texto_respuesta, es_correcta, activa) VALUES
(16, 6, 'Tornillo.', 1, 1),
(17, 6, 'Palanca.', 0, 1),
(18, 6, 'Polea.', 0, 1)
ON DUPLICATE KEY UPDATE texto_respuesta=VALUES(texto_respuesta), es_correcta=VALUES(es_correcta);


-- 5. Insertar Preguntas para la Sala de biodiversidad (id_estacion = 3)
INSERT INTO preguntas (id_pregunta, id_estacion, pregunta, activa) VALUES
(7, 3, '¿Qué es la biodiversidad?', 1),
(8, 3, '¿Qué tipo de selva es la Selva Lacandona, joya de biodiversidad en Chiapas?', 1),
(9, 3, '¿Cuál es un animal representativo y en peligro de extinción de la Selva Lacandona?', 1)
ON DUPLICATE KEY UPDATE pregunta=VALUES(pregunta), id_estacion=VALUES(id_estacion);

-- Respuestas para Pregunta 7
INSERT INTO respuestas (id_respuesta, id_pregunta, texto_respuesta, es_correcta, activa) VALUES
(19, 7, 'La variedad de vida animal, vegetal y de ecosistemas en la Tierra.', 1, 1),
(20, 7, 'La acumulación de rocas y minerales en el subsuelo.', 0, 1),
(21, 7, 'El estudio exclusivo de bacterias y microorganismos.', 0, 1)
ON DUPLICATE KEY UPDATE texto_respuesta=VALUES(texto_respuesta), es_correcta=VALUES(es_correcta);

-- Respuestas para Pregunta 8
INSERT INTO respuestas (id_respuesta, id_pregunta, texto_respuesta, es_correcta, activa) VALUES
(22, 8, 'Selva seca decidua.', 0, 1),
(23, 8, 'Selva alta perennifolia.', 1, 1),
(24, 8, 'Bosque templado de coníferas.', 0, 1)
ON DUPLICATE KEY UPDATE texto_respuesta=VALUES(texto_respuesta), es_correcta=VALUES(es_correcta);

-- Respuestas para Pregunta 9
INSERT INTO respuestas (id_respuesta, id_pregunta, texto_respuesta, es_correcta, activa) VALUES
(25, 9, 'El jaguar.', 1, 1),
(26, 9, 'El oso polar.', 0, 1),
(27, 9, 'El canguro rojo.', 0, 1)
ON DUPLICATE KEY UPDATE texto_respuesta=VALUES(texto_respuesta), es_correcta=VALUES(es_correcta);

-- 6. Insertar algunas imágenes para rompecabezas (id_imagen)
INSERT INTO imagenes_rompecabezas (id_imagen, titulo, ruta_imagen, descripcion, activa) VALUES
(1, 'Spinosaurio MUCH', 'assets/rompecabezas/spino.png', 'Imagen del espinosaurio oficial para el armado en el reto SBEEL', 1),
(2, 'Triceratops MUCH', 'assets/rompecabezas/tricera.png', 'Imagen de triceratops animado para el reto secundario', 1)
ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), ruta_imagen=VALUES(ruta_imagen), descripcion=VALUES(descripcion);
