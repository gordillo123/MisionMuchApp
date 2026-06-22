-- Migración: sistema de bloqueo por tiempo de juego
-- Ejecutar sobre la base de datos mision_much

CREATE TABLE IF NOT EXISTS configuracion_juego (
  id_config INT AUTO_INCREMENT PRIMARY KEY,
  bloqueo_activo BOOLEAN NOT NULL DEFAULT TRUE,
  cantidad INT NOT NULL DEFAULT 1,
  unidad ENUM('dias', 'semanas', 'meses') NOT NULL DEFAULT 'semanas',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by INT NULL,
  CONSTRAINT fk_config_updated_by FOREIGN KEY (updated_by) REFERENCES usuarios (id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO configuracion_juego (bloqueo_activo, cantidad, unidad)
SELECT TRUE, 1, 'semanas'
WHERE NOT EXISTS (SELECT 1 FROM configuracion_juego LIMIT 1);

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
  fecha_puede_volver_jugar TIMESTAMP NULL,
  cantidad_bloqueo INT NULL,
  unidad_bloqueo ENUM('dias', 'semanas', 'meses') NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_premios_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_premios_participacion FOREIGN KEY (id_participacion) REFERENCES participaciones (id_participacion) ON DELETE SET NULL,
  CONSTRAINT fk_premios_boleto FOREIGN KEY (id_boleto) REFERENCES boletos (id_boleto) ON DELETE SET NULL,
  INDEX idx_premios_usuario (id_usuario),
  INDEX idx_premios_estado (estado),
  INDEX idx_premios_fecha_volver (fecha_puede_volver_jugar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
