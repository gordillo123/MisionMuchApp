-- database/seed.sql
-- Datos iniciales para "Misión MUCH"

-- Insertar estaciones
INSERT INTO estaciones (nombre, descripcion, orden, estado) VALUES
('Minijuego', 'Minijuego de dinosaurio al inicio', 1, 'ACTIVA'),
('SBEEL / Rompecabezas', 'Armado de rompecabezas SBEEL', 2, 'ACTIVA'),
('Sala de desarrollo sustentable', 'Preguntas sobre desarrollo sustentable', 3, 'ACTIVA'),
('Sala de energía', 'Preguntas sobre tipos de energía', 4, 'ACTIVA'),
('Sala de biodiversidad', 'Preguntas sobre la flora y fauna', 5, 'ACTIVA'),
('Boleto final', 'Generación del boleto final de premio', 6, 'ACTIVA');

-- Insertar algunas preguntas de ejemplo para Sala de desarrollo sustentable (id 3)
INSERT INTO preguntas (estacion_id, texto_pregunta) VALUES
(3, '¿Qué es el desarrollo sustentable?'),
(3, '¿Cuál de las siguientes es una fuente de energía renovable?');

-- Insertar respuestas para las preguntas de ejemplo
-- Para la pregunta 1: ¿Qué es el desarrollo sustentable?
INSERT INTO respuestas (pregunta_id, texto_respuesta, es_correcta) VALUES
(1, 'Gastar todos los recursos naturales rápidamente.', false),
(1, 'Satisfacer las necesidades actuales sin comprometer las de las generaciones futuras.', true),
(1, 'Ignorar el medio ambiente a favor del dinero.', false);

-- Para la pregunta 2: ¿Cuál de las siguientes es una fuente de energía renovable?
INSERT INTO respuestas (pregunta_id, texto_respuesta, es_correcta) VALUES
(2, 'Petróleo', false),
(2, 'Carbón', false),
(2, 'Energía solar', true);
