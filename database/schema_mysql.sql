-- database/schema_mysql.sql
-- Esquema de base de datos MySQL local para "Misión MUCH"

-- Crear tablas en el orden correcto para respetar llaves foráneas

-- 1. Tabla: usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  correo VARCHAR(150) NOT NULL UNIQUE,
  google_id VARCHAR(255) UNIQUE,
  avatar_url TEXT NULL,
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ultimo_login TIMESTAMP NULL,
  activo BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla: roles
CREATE TABLE IF NOT EXISTS roles (
  id_rol INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla: usuarios_roles
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

-- 4. Tabla: estaciones
CREATE TABLE IF NOT EXISTS estaciones (
  id_estacion INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT NULL,
  orden INT NOT NULL,
  puntos INT DEFAULT 10,
  puntaje_minimo INT DEFAULT 7,
  tipo VARCHAR(50) DEFAULT 'preguntas',
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabla: preguntas
CREATE TABLE IF NOT EXISTS preguntas (
  id_pregunta INT AUTO_INCREMENT PRIMARY KEY,
  id_estacion INT NOT NULL,
  pregunta TEXT NOT NULL,
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_preguntas_estacion FOREIGN KEY (id_estacion) REFERENCES estaciones (id_estacion) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabla: respuestas
CREATE TABLE IF NOT EXISTS respuestas (
  id_respuesta INT AUTO_INCREMENT PRIMARY KEY,
  id_pregunta INT NOT NULL,
  texto_respuesta TEXT NOT NULL,
  es_correcta BOOLEAN DEFAULT FALSE,
  activa BOOLEAN DEFAULT TRUE,
  CONSTRAINT fk_respuestas_pregunta FOREIGN KEY (id_pregunta) REFERENCES preguntas (id_pregunta) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Tabla: progreso_usuario
CREATE TABLE IF NOT EXISTS progreso_usuario (
  id_progreso INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  id_estacion INT NOT NULL,
  completada BOOLEAN DEFAULT FALSE,
  aprobada BOOLEAN DEFAULT FALSE,
  puntaje INT DEFAULT 0,
  aciertos INT DEFAULT 0,
  errores INT DEFAULT 0,
  fecha_inicio TIMESTAMP NULL,
  fecha_completado TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_progreso_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_progreso_estacion FOREIGN KEY (id_estacion) REFERENCES estaciones (id_estacion) ON DELETE CASCADE,
  UNIQUE KEY unique_usuario_estacion (id_usuario, id_estacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Tabla: intentos_estacion
CREATE TABLE IF NOT EXISTS intentos_estacion (
  id_intento INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  id_estacion INT NOT NULL,
  puntaje INT DEFAULT 0,
  aciertos INT DEFAULT 0,
  errores INT DEFAULT 0,
  aprobado BOOLEAN DEFAULT FALSE,
  finalizado BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_intento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_intentos_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_intentos_estacion FOREIGN KEY (id_estacion) REFERENCES estaciones (id_estacion) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Tabla: respuestas_usuario
CREATE TABLE IF NOT EXISTS respuestas_usuario (
  id_respuesta_usuario INT AUTO_INCREMENT PRIMARY KEY,
  id_intento INT NOT NULL,
  id_usuario INT NOT NULL,
  id_pregunta INT NOT NULL,
  id_respuesta INT NOT NULL,
  es_correcta BOOLEAN DEFAULT FALSE,
  fecha_respuesta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ru_intento FOREIGN KEY (id_intento) REFERENCES intentos_estacion (id_intento) ON DELETE CASCADE,
  CONSTRAINT fk_ru_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_ru_pregunta FOREIGN KEY (id_pregunta) REFERENCES preguntas (id_pregunta) ON DELETE CASCADE,
  CONSTRAINT fk_ru_respuesta FOREIGN KEY (id_respuesta) REFERENCES respuestas (id_respuesta) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Tabla: imagenes_rompecabezas
CREATE TABLE IF NOT EXISTS imagenes_rompecabezas (
  id_imagen INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(150) NULL,
  ruta_imagen TEXT NOT NULL,
  descripcion TEXT NULL,
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Tabla: partidas_minijuego
CREATE TABLE IF NOT EXISTS partidas_minijuego (
  id_partida INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  id_estacion INT NULL,
  puntaje INT DEFAULT 0,
  aprobado BOOLEAN DEFAULT FALSE,
  fecha_partida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pm_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_pm_estacion FOREIGN KEY (id_estacion) REFERENCES estaciones (id_estacion) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Tabla: boletos
CREATE TABLE IF NOT EXISTS boletos (
  id_boleto INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  folio VARCHAR(100) NOT NULL UNIQUE,
  qr_token VARCHAR(255) NOT NULL UNIQUE,
  qr_data TEXT NULL,
  tipo_entrada VARCHAR(100) NULL,
  destino_boleto VARCHAR(50) NULL,
  seccion_boleto VARCHAR(100) NULL,
  estado VARCHAR(30) DEFAULT 'activo',
  usado BOOLEAN DEFAULT FALSE,
  valido_desde TIMESTAMP NULL,
  valido_hasta TIMESTAMP NULL,
  fecha_generacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_uso TIMESTAMP NULL,
  fecha_canje TIMESTAMP NULL,
  canjeado_por INT NULL,
  ultimo_escaneo TIMESTAMP NULL,
  observaciones TEXT NULL,
  CONSTRAINT fk_boletos_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_boletos_canjeador FOREIGN KEY (canjeado_por) REFERENCES usuarios (id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Tabla: movimientos_boleto
CREATE TABLE IF NOT EXISTS movimientos_boleto (
  id_movimiento INT AUTO_INCREMENT PRIMARY KEY,
  id_boleto INT NOT NULL,
  id_usuario INT NOT NULL,
  realizado_por INT NULL,
  tipo_movimiento VARCHAR(50) NOT NULL,
  observaciones TEXT NULL,
  fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mb_boleto FOREIGN KEY (id_boleto) REFERENCES boletos (id_boleto) ON DELETE CASCADE,
  CONSTRAINT fk_mb_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_mb_realizado FOREIGN KEY (realizado_por) REFERENCES usuarios (id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Tabla: escaneos_qr_boleto
CREATE TABLE IF NOT EXISTS escaneos_qr_boleto (
  id_escaneo INT AUTO_INCREMENT PRIMARY KEY,
  id_boleto INT NULL,
  qr_token VARCHAR(255) NOT NULL,
  escaneado_por INT NULL,
  resultado VARCHAR(50) NOT NULL,
  observaciones TEXT NULL,
  fecha_escaneo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_eq_boleto FOREIGN KEY (id_boleto) REFERENCES boletos (id_boleto) ON DELETE CASCADE,
  CONSTRAINT fk_eq_escaneado FOREIGN KEY (escaneado_por) REFERENCES usuarios (id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Tabla: auditoria_acciones
CREATE TABLE IF NOT EXISTS auditoria_acciones (
  id_auditoria INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NULL,
  rol_accion VARCHAR(50) NULL,
  accion VARCHAR(150) NOT NULL,
  tabla_afectada VARCHAR(100) NULL,
  id_registro VARCHAR(100) NULL,
  descripcion TEXT NULL,
  fecha_accion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_aa_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Tabla: verificaciones_ubicacion
CREATE TABLE IF NOT EXISTS verificaciones_ubicacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  session_id VARCHAR(255) NULL,
  direccion_museo TEXT NOT NULL,
  latitud_usuario DOUBLE PRECISION NULL,
  longitud_usuario DOUBLE PRECISION NULL,
  precision_gps DOUBLE PRECISION NULL,
  latitud_museo DOUBLE PRECISION NOT NULL,
  longitud_museo DOUBLE PRECISION NOT NULL,
  radio_permitido_metros INT NOT NULL DEFAULT 150,
  distancia_metros DOUBLE PRECISION NULL,
  dentro_del_museo BOOLEAN NOT NULL DEFAULT false,
  permiso_ubicacion BOOLEAN NOT NULL DEFAULT false,
  mensaje_resultado TEXT NULL,
  fecha_verificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vu_usuario FOREIGN KEY (user_id) REFERENCES usuarios (id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

