-- Migración: sistema de bloqueo por tiempo de juego
-- Ejecutar sobre la base de datos mision_much

CREATE TABLE IF NOT EXISTS configuracion_juego (
  id_config INT AUTO_INCREMENT PRIMARY KEY,
  bloqueo_activo BOOLEAN NOT NULL DEFAULT TRUE,
  cantidad INT NOT NULL DEFAULT 7,
  unidad ENUM('dias', 'semanas', 'meses') NOT NULL DEFAULT 'dias',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by INT NULL,
  CONSTRAINT fk_config_updated_by FOREIGN KEY (updated_by) REFERENCES usuarios (id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO configuracion_juego (bloqueo_activo, cantidad, unidad)
SELECT TRUE, 7, 'dias'
WHERE NOT EXISTS (SELECT 1 FROM configuracion_juego LIMIT 1);

-- Convierte cualquier configuración anterior a su equivalente en días.
UPDATE configuracion_juego
SET cantidad = CASE
  WHEN unidad = 'semanas' THEN cantidad * 7
  WHEN unidad = 'meses' THEN cantidad * 30
  ELSE cantidad
END,
unidad = 'dias'
WHERE unidad <> 'dias';

CREATE TABLE IF NOT EXISTS participaciones (
  id_participacion INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  fecha_inicio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_fin TIMESTAMP NULL,
  estado ENUM('en_curso', 'ganado', 'reclamado', 'habilitado') NOT NULL DEFAULT 'en_curso',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_participaciones_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE,
  INDEX idx_participaciones_usuario (id_usuario),
  INDEX idx_participaciones_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS premios (
  id_premio INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  id_participacion INT NULL,
  id_boleto INT NULL,
  estado ENUM('pendiente', 'reclamado', 'entregado') NOT NULL DEFAULT 'pendiente',
  fecha_ganado TIMESTAMP NULL,
  fecha_reclamado TIMESTAMP NULL,
  fecha_entregado TIMESTAMP NULL,
  fecha_finalizacion TIMESTAMP NULL,
  fecha_puede_volver_jugar TIMESTAMP NULL,
  cantidad_bloqueo INT NULL,
  unidad_bloqueo ENUM('dias', 'semanas', 'meses') NULL,
  ciclo_reiniciado_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_premios_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_premios_participacion FOREIGN KEY (id_participacion) REFERENCES participaciones (id_participacion) ON DELETE SET NULL,
  CONSTRAINT fk_premios_boleto FOREIGN KEY (id_boleto) REFERENCES boletos (id_boleto) ON DELETE SET NULL,
  INDEX idx_premios_usuario (id_usuario),
  INDEX idx_premios_estado (estado),
  INDEX idx_premios_fecha_volver (fecha_puede_volver_jugar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agrega las columnas al actualizar una instalación que ya tenía la tabla.
SET @sql_fecha_finalizacion = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'premios' AND COLUMN_NAME = 'fecha_finalizacion') = 0,
  'ALTER TABLE premios ADD COLUMN fecha_finalizacion TIMESTAMP NULL AFTER fecha_entregado',
  'SELECT 1'
);
PREPARE stmt_fecha_finalizacion FROM @sql_fecha_finalizacion;
EXECUTE stmt_fecha_finalizacion;
DEALLOCATE PREPARE stmt_fecha_finalizacion;

SET @sql_ciclo_reiniciado = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'premios' AND COLUMN_NAME = 'ciclo_reiniciado_at') = 0,
  'ALTER TABLE premios ADD COLUMN ciclo_reiniciado_at TIMESTAMP NULL AFTER unidad_bloqueo',
  'SELECT 1'
);
PREPARE stmt_ciclo_reiniciado FROM @sql_ciclo_reiniciado;
EXECUTE stmt_ciclo_reiniciado;
DEALLOCATE PREPARE stmt_ciclo_reiniciado;

UPDATE premios
SET fecha_finalizacion = fecha_ganado
WHERE fecha_finalizacion IS NULL AND fecha_ganado IS NOT NULL;
