-- database/migration_intentos_bloqueo.sql
-- Ejecutar sobre la base de datos mision_much para soportar el sistema de intentos y bloqueo global.

-- 1. Agregar columna para guardar la estación específica en la que se agotaron los intentos.
ALTER TABLE premios ADD COLUMN id_estacion_bloqueo INT NULL;

-- 2. Agregar columna para guardar la cantidad de intentos realizados antes del bloqueo (por defecto 3).
ALTER TABLE premios ADD COLUMN intentos_realizados INT DEFAULT 3;

-- 3. Agregar columna para guardar la fecha y hora exactas del inicio del bloqueo.
ALTER TABLE premios ADD COLUMN fecha_bloqueo TIMESTAMP NULL;

-- 4. Agregar columna para el estado actual del bloqueo ('activo', 'desbloqueado', etc.).
ALTER TABLE premios ADD COLUMN estado_bloqueo VARCHAR(50) DEFAULT 'activo';
