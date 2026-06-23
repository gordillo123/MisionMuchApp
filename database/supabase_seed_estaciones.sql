-- Misión MUCH: estaciones base para que progreso_usuario pueda guardar la llave foránea.
-- Ejecutar en el editor SQL de Supabase después de supabase_schema.sql.

INSERT INTO public.estaciones (id, codigo, nombre, descripcion, orden, estado)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 'inicio', 'Inicio de sesión', 'Acceso con Google y selección de avatar.', 1, 'ACTIVA'),
  (2, 'spinosaurio', 'Minijuego Espinosaurio', 'Dinámica de carrera con un dinosaurio.', 2, 'ACTIVA'),
  (3, 'biodiversidad', 'Biodiversidad y Conocimiento', 'Preguntas de biodiversidad y conocimiento.', 3, 'ACTIVA'),
  (4, 'energia', 'Sala de Energía', 'Preguntas sobre la energía.', 4, 'ACTIVA'),
  (5, 'desarrollo-sustentable', 'Desarrollo Sustentable', 'Preguntas sobre el desarrollo sustentable.', 5, 'ACTIVA'),
  (6, 'sbeel', 'SBEEL Dinosaurios', 'Rompecabezas de dinosaurios.', 6, 'ACTIVA')
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  orden = EXCLUDED.orden,
  estado = EXCLUDED.estado;
