-- database/schema.sql
-- Archivo para la creación de la base de datos de "Misión MUCH"

-- Tabla de Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(150) UNIQUE NOT NULL,
    google_id VARCHAR(255) UNIQUE,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Estaciones (Salas)
CREATE TABLE IF NOT EXISTS estaciones (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    orden INT NOT NULL,
    estado VARCHAR(20) DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'INACTIVA'))
);

-- Tabla de Preguntas
CREATE TABLE IF NOT EXISTS preguntas (
    id SERIAL PRIMARY KEY,
    estacion_id INT NOT NULL,
    texto_pregunta TEXT NOT NULL,
    FOREIGN KEY (estacion_id) REFERENCES estaciones(id) ON DELETE CASCADE
);

-- Tabla de Respuestas
CREATE TABLE IF NOT EXISTS respuestas (
    id SERIAL PRIMARY KEY,
    pregunta_id INT NOT NULL,
    texto_respuesta TEXT NOT NULL,
    es_correcta BOOLEAN NOT NULL DEFAULT false,
    FOREIGN KEY (pregunta_id) REFERENCES preguntas(id) ON DELETE CASCADE
);

-- Tabla de Progreso del Usuario
CREATE TABLE IF NOT EXISTS progreso_usuario (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL,
    estacion_id INT NOT NULL,
    completada_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (usuario_id, estacion_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (estacion_id) REFERENCES estaciones(id) ON DELETE CASCADE
);

-- Tabla de Intentos en Estación
CREATE TABLE IF NOT EXISTS intentos_estacion (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL,
    estacion_id INT NOT NULL,
    aciertos INT DEFAULT 0,
    errores INT DEFAULT 0,
    puntaje INT DEFAULT 0,
    aprobado BOOLEAN DEFAULT false,
    finalizado BOOLEAN DEFAULT false,
    fecha_intento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (estacion_id) REFERENCES estaciones(id) ON DELETE CASCADE
);

-- Tabla de Imágenes de Rompecabezas (SBEEL)
CREATE TABLE IF NOT EXISTS imagenes_rompecabezas (
    id SERIAL PRIMARY KEY,
    url_imagen VARCHAR(255) NOT NULL,
    descripcion VARCHAR(150)
);

-- Tabla de Partidas del Mini Juego (Dinosaurio)
CREATE TABLE IF NOT EXISTS partidas_minijuego (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL,
    puntaje INT NOT NULL,
    aprobado BOOLEAN DEFAULT false,
    fecha_partida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Tabla de Boletos Finales
CREATE TABLE IF NOT EXISTS boletos (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL,
    folio VARCHAR(50) UNIQUE NOT NULL,
    estado VARCHAR(20) DEFAULT 'NO_USADO' CHECK (estado IN ('USADO', 'NO_USADO')),
    fecha_generacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_uso TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
