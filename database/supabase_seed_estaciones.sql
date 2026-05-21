-- Mision MUCH - estaciones base para que progreso_usuario pueda guardar FK.
-- Ejecutar en Supabase SQL Editor despues de supabase_schema.sql.

INSERT INTO public.estaciones (id, codigo, nombre, descripcion, orden, estado)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 'inicio', 'Inicio de sesion', 'Acceso con Google y seleccion de avatar.', 1, 'ACTIVA'),
  (2, 'spinosaurio', 'Mini juego Spinosaurio', 'Dinamica tipo dinosaurio.', 2, 'ACTIVA'),
  (3, 'biodiversidad', 'Sala de biodiversidad', 'Preguntas de biodiversidad y conocimiento.', 3, 'ACTIVA'),
  (4, 'energia', 'Sala de energia', 'Preguntas de energia.', 4, 'ACTIVA'),
  (5, 'desarrollo-sustentable', 'Sala de desarrollo sustentable', 'Preguntas de desarrollo sustentable.', 5, 'ACTIVA'),
  (6, 'sbeel', 'SBEEL Rompecabezas', 'Rompecabezas de dinosaurios.', 6, 'ACTIVA')
ON CONFLICT (id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  orden = EXCLUDED.orden,
  estado = EXCLUDED.estado;
