-- database/migration_google_auth_mysql.sql
-- Migracion segura para autenticacion con Google + MySQL en Mision MUCH.
-- Ejecuta este archivo sobre la base existente antes de probar el login.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) NULL AFTER telefono,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL AFTER google_id,
  ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMP NULL AFTER fecha_registro,
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE AFTER ultimo_login;

-- Asegura unicidad sin duplicar indices si ya existen en instalaciones recientes.
SET @idx_correo := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND INDEX_NAME = 'correo'
);
SET @sql_correo := IF(@idx_correo = 0, 'ALTER TABLE usuarios ADD UNIQUE KEY correo (correo)', 'SELECT 1');
PREPARE stmt_correo FROM @sql_correo;
EXECUTE stmt_correo;
DEALLOCATE PREPARE stmt_correo;

SET @idx_google := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND INDEX_NAME = 'google_id'
);
SET @sql_google := IF(@idx_google = 0, 'ALTER TABLE usuarios ADD UNIQUE KEY google_id (google_id)', 'SELECT 1');
PREPARE stmt_google FROM @sql_google;
EXECUTE stmt_google;
DEALLOCATE PREPARE stmt_google;

CREATE TABLE IF NOT EXISTS roles (
  id_rol INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios_roles (
  id_usuario_rol INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  id_rol INT NOT NULL,
  asignado_por INT NULL,
  fecha_asignacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ur_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_ur_rol FOREIGN KEY (id_rol) REFERENCES roles (id_rol) ON DELETE CASCADE,
  CONSTRAINT fk_ur_asignador FOREIGN KEY (asignado_por) REFERENCES usuarios (id_usuario) ON DELETE SET NULL,
  UNIQUE KEY unique_usuario_rol (id_usuario, id_rol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles (nombre, descripcion) VALUES
  ('usuario', 'Jugador regular que usa las estaciones del recorrido'),
  ('admin', 'Administrador general del sistema'),
  ('taquilla', 'Operador de taquilla y validacion de boletos')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

-- Los usuarios nuevos por Google reciben solo rol usuario desde el backend.
-- Para promover cuentas existentes a admin o taquilla, asigna el rol manualmente:
-- INSERT INTO usuarios_roles (id_usuario, id_rol)
-- SELECT u.id_usuario, r.id_rol FROM usuarios u JOIN roles r ON r.nombre = 'admin'
-- WHERE u.correo = 'correo-admin@dominio.com'
-- ON DUPLICATE KEY UPDATE id_usuario = id_usuario;
