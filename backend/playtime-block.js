// backend/playtime-block.js
// Sistema de bloqueo por tiempo entre participaciones

const TZ = process.env.TZ || 'America/Mexico_City';

const DIAS_BLOQUEO_POR_DEFECTO = 7;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function formatFechaHoraMX(date) {
  if (!date) return '';
  const value = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ,
    dateStyle: 'long',
    timeStyle: 'short'
  }).format(value);
}

function formatFechaHoraMXPartes(date) {
  if (!date) return { fecha: '', hora: '' };
  const value = date instanceof Date ? date : new Date(date);
  const fecha = new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ,
    dateStyle: 'long'
  }).format(value);
  const hora = new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ,
    timeStyle: 'short'
  }).format(value);
  return { fecha, hora };
}

function formatFechaMX(date) {
  if (!date) return '';
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';

  const parts = new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.weekday} ${values.day} de ${values.month} de ${values.year}`;
}

function buildMensajeBloqueo(fechaPuedeVolver) {
  return `¡Ya completaste tu aventura!\nTu boleto fue generado correctamente.\nPodrás volver a jugar el ${formatFechaMX(fechaPuedeVolver)}.`;
}

function buildMensajeBloqueoIntentos(fechaPuedeVolver, estacionNombre = 'esta estación') {
  return `Has agotado tus 3 intentos en esta estación. Tu acceso al juego ha sido bloqueado temporalmente. Podrás volver a jugar después de una semana.`;
}

function calcularFechaDesbloqueo(fechaBase, config) {
  const base = fechaBase instanceof Date ? new Date(fechaBase.getTime()) : new Date(fechaBase);
  if (Number.isNaN(base.getTime())) throw new Error('Fecha base inválida.');
  const cantidad = Math.max(1, Math.trunc(Number(config?.cantidad) || DIAS_BLOQUEO_POR_DEFECTO));
  return new Date(base.getTime() + (cantidad * MS_POR_DIA));
}

function msRestantes(fechaPuedeVolver) {
  if (!fechaPuedeVolver) return 0;
  const target = new Date(fechaPuedeVolver).getTime();
  return Math.max(0, target - Date.now());
}

function formatTiempoRestante(ms) {
  if (ms <= 0) return 'Disponible ahora';
  const totalMin = Math.ceil(ms / 60000);
  const dias = Math.floor(totalMin / (60 * 24));
  const horas = Math.floor((totalMin % (60 * 24)) / 60);
  const minutos = totalMin % 60;
  const partes = [];
  if (dias > 0) partes.push(`${dias} día${dias === 1 ? '' : 's'}`);
  if (horas > 0) partes.push(`${horas} hora${horas === 1 ? '' : 's'}`);
  if (minutos > 0 && dias === 0) partes.push(`${minutos} min`);
  return partes.join(' ') || 'Menos de 1 minuto';
}

function createPlaytimeBlockService(pool) {
  async function ensureColumn(tableName, columnName, ddl) {
    const [columns] = await pool.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [columnName]);
    if (columns.length === 0) await pool.query(ddl);
  }

  async function ensureTables() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS configuracion_juego (
        id_config INT AUTO_INCREMENT PRIMARY KEY,
        bloqueo_activo BOOLEAN NOT NULL DEFAULT TRUE,
        cantidad INT NOT NULL DEFAULT 7,
        unidad ENUM('dias', 'semanas', 'meses') NOT NULL DEFAULT 'dias',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by INT NULL,
        CONSTRAINT fk_config_updated_by FOREIGN KEY (updated_by) REFERENCES usuarios (id_usuario) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await ensureColumn(
      'premios',
      'motivo_bloqueo',
      'ALTER TABLE premios ADD COLUMN motivo_bloqueo VARCHAR(50) NULL AFTER unidad_bloqueo'
    );
    await ensureColumn(
      'premios',
      'detalle_bloqueo',
      'ALTER TABLE premios ADD COLUMN detalle_bloqueo VARCHAR(255) NULL AFTER motivo_bloqueo'
    );

    const [fechaFinalizacionColumn] = await pool.query(
      "SHOW COLUMNS FROM premios LIKE 'fecha_finalizacion'"
    );
    if (fechaFinalizacionColumn.length === 0) {
      await pool.query('ALTER TABLE premios ADD COLUMN fecha_finalizacion TIMESTAMP NULL AFTER fecha_entregado');
    }

    const [cicloReiniciadoColumn] = await pool.query(
      "SHOW COLUMNS FROM premios LIKE 'ciclo_reiniciado_at'"
    );
    if (cicloReiniciadoColumn.length === 0) {
      await pool.query('ALTER TABLE premios ADD COLUMN ciclo_reiniciado_at TIMESTAMP NULL AFTER unidad_bloqueo');
    }

    await ensureColumn(
      'premios',
      'id_estacion_bloqueo',
      'ALTER TABLE premios ADD COLUMN id_estacion_bloqueo INT NULL'
    );
    await ensureColumn(
      'premios',
      'intentos_realizados',
      'ALTER TABLE premios ADD COLUMN intentos_realizados INT DEFAULT 3'
    );
    await ensureColumn(
      'premios',
      'fecha_bloqueo',
      'ALTER TABLE premios ADD COLUMN fecha_bloqueo TIMESTAMP NULL'
    );
    await ensureColumn(
      'premios',
      'estado_bloqueo',
      "ALTER TABLE premios ADD COLUMN estado_bloqueo VARCHAR(50) DEFAULT 'activo'"
    );

    const [[exists]] = await pool.query('SELECT id_config, cantidad, unidad FROM configuracion_juego LIMIT 1');
    if (!exists) {
      await pool.query(
        `INSERT INTO configuracion_juego (bloqueo_activo, cantidad, unidad) VALUES (TRUE, 7, 'dias')`
      );
    } else if (exists.unidad !== 'dias') {
      const diasEquivalentes = exists.unidad === 'semanas'
        ? Number(exists.cantidad) * 7
        : Number(exists.cantidad) * 30;
      await pool.query(
        `UPDATE configuracion_juego SET cantidad = ?, unidad = 'dias' WHERE id_config = ?`,
        [Math.max(1, Math.min(3650, diasEquivalentes)), exists.id_config]
      );
    }

    await pool.query(
      `UPDATE premios
       SET fecha_finalizacion = fecha_ganado
       WHERE fecha_finalizacion IS NULL AND fecha_ganado IS NOT NULL`
    );
  }

  async function getConfig() {
    const [[row]] = await pool.query(
      'SELECT * FROM configuracion_juego ORDER BY id_config ASC LIMIT 1'
    );
    return row || { bloqueo_activo: true, cantidad: DIAS_BLOQUEO_POR_DEFECTO, unidad: 'dias' };
  }

  async function updateConfig(data, updatedBy = null) {
    const config = await getConfig();
    const bloqueoActivo = data.bloqueo_activo !== undefined ? Boolean(data.bloqueo_activo) : Boolean(config.bloqueo_activo);
    const cantidad = Number(data.cantidad ?? config.cantidad ?? DIAS_BLOQUEO_POR_DEFECTO);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 3650) {
      throw new Error('La cantidad de días debe ser un número entero entre 1 y 3650.');
    }
    const unidad = 'dias';

    await pool.query(
      `UPDATE configuracion_juego
       SET bloqueo_activo = ?, cantidad = ?, unidad = ?, updated_by = ?
       WHERE id_config = ?`,
      [bloqueoActivo, cantidad, unidad, updatedBy, config.id_config]
    );

    return getConfig();
  }

  async function getUltimoPremioFinalizado(idUsuario, connection = null) {
    const conn = connection || pool;
    const [[premio]] = await conn.query(
      `SELECT * FROM premios
       WHERE id_usuario = ?
         AND fecha_puede_volver_jugar IS NOT NULL
         AND COALESCE(fecha_reclamado, fecha_finalizacion, fecha_ganado) IS NOT NULL
       ORDER BY COALESCE(fecha_reclamado, fecha_finalizacion, fecha_ganado, created_at) DESC
       LIMIT 1`,
      [idUsuario]
    );
    return premio || null;
  }

  async function prepararNuevoCiclo(idUsuario, premio) {
    if (!premio || premio.ciclo_reiniciado_at) return false;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [[actual]] = await connection.query(
        'SELECT * FROM premios WHERE id_premio = ? FOR UPDATE',
        [premio.id_premio]
      );
      if (!actual || actual.ciclo_reiniciado_at || !actual.fecha_puede_volver_jugar
          || Date.now() < new Date(actual.fecha_puede_volver_jugar).getTime()) {
        await connection.commit();
        return false;
      }

      await connection.query('DELETE FROM progreso_usuario WHERE id_usuario = ?', [idUsuario]);
      await connection.query('DELETE FROM intentos_estacion WHERE id_usuario = ?', [idUsuario]);
      await connection.query(
        "UPDATE premios SET ciclo_reiniciado_at = CURRENT_TIMESTAMP, estado_bloqueo = 'desbloqueado' WHERE id_premio = ?",
        [actual.id_premio]
      );
      await connection.query(
        `UPDATE participaciones SET estado = 'habilitado'
         WHERE id_participacion = ? AND estado IN ('ganado', 'reclamado')`,
        [actual.id_participacion]
      );
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function getEstadoBloqueo(idUsuario) {
    const config = await getConfig();
    const habilitado = { bloqueado: false, habilitado: true, config };
    let premio = await getUltimoPremioFinalizado(idUsuario);
    const esBloqueoPorIntentos = premio?.motivo_bloqueo === 'intentos';

    if (!config.bloqueo_activo && !esBloqueoPorIntentos) {
      if (!premio) return { ...habilitado, motivo: 'bloqueo_desactivado' };
      await pool.query(
        `UPDATE premios SET fecha_puede_volver_jugar = CURRENT_TIMESTAMP
         WHERE id_premio = ? AND ciclo_reiniciado_at IS NULL`,
        [premio.id_premio]
      );
      premio = await getUltimoPremioFinalizado(idUsuario);
      const nuevoCicloIniciado = await prepararNuevoCiclo(idUsuario, premio);
      return {
        ...habilitado,
        motivo: 'bloqueo_desactivado',
        nuevo_ciclo_iniciado: nuevoCicloIniciado,
        ciclo_juego_id: `premio-${premio.id_premio}-${new Date(premio.fecha_puede_volver_jugar).getTime()}`
      };
    }

    if (!premio || !premio.fecha_puede_volver_jugar) {
      return habilitado;
    }

    const fechaPuedeVolver = new Date(premio.fecha_puede_volver_jugar);
    if (Date.now() >= fechaPuedeVolver.getTime()) {
      const nuevoCicloIniciado = await prepararNuevoCiclo(idUsuario, premio);
      if (nuevoCicloIniciado) premio = await getUltimoPremioFinalizado(idUsuario);
      return {
        ...habilitado,
        premio_anterior: premio,
        motivo: 'tiempo_cumplido',
        nuevo_ciclo_iniciado: nuevoCicloIniciado,
        ciclo_juego_id: `premio-${premio.id_premio}-${new Date(premio.fecha_puede_volver_jugar).getTime()}`
      };
    }

    const restanteMs = msRestantes(fechaPuedeVolver);
    const motivoBloqueo = premio?.motivo_bloqueo || 'reclamo_boleto';
    const mensaje = motivoBloqueo === 'intentos'
      ? buildMensajeBloqueoIntentos(fechaPuedeVolver, premio.detalle_bloqueo || 'esta estación')
      : buildMensajeBloqueo(fechaPuedeVolver);
    return {
      bloqueado: true,
      habilitado: false,
      config,
      premio,
      motivo_bloqueo: motivoBloqueo,
      fecha_puede_volver: fechaPuedeVolver.toISOString(),
      fecha_puede_volver_texto: formatFechaMX(fechaPuedeVolver),
      tiempo_restante: formatTiempoRestante(restanteMs),
      tiempo_restante_ms: restanteMs,
      mensaje
    };
  }

  async function asegurarParticipacionActiva(connection, idUsuario) {
    const conn = connection || pool;
    const [[activa]] = await conn.query(
      `SELECT * FROM participaciones
       WHERE id_usuario = ? AND estado IN ('en_curso', 'ganado')
       ORDER BY id_participacion DESC
       LIMIT 1`,
      [idUsuario]
    );

    if (activa) return activa;

    const [result] = await conn.query(
      `INSERT INTO participaciones (id_usuario, estado) VALUES (?, 'en_curso')`,
      [idUsuario]
    );

    const [[nueva]] = await conn.query(
      'SELECT * FROM participaciones WHERE id_participacion = ?',
      [result.insertId]
    );
    return nueva;
  }

  async function registrarGanado(idUsuario, idBoleto = null, connection = null) {
    const conn = connection || pool;
    const config = await getConfig();
    const participacion = await asegurarParticipacionActiva(conn, idUsuario);

    await conn.query(
      `UPDATE participaciones SET estado = 'ganado', fecha_fin = COALESCE(fecha_fin, CURRENT_TIMESTAMP)
       WHERE id_participacion = ?`,
      [participacion.id_participacion]
    );

    const [[premioPendiente]] = await conn.query(
      `SELECT * FROM premios
       WHERE id_usuario = ? AND id_participacion = ? AND estado = 'pendiente'
       ORDER BY id_premio DESC LIMIT 1`,
      [idUsuario, participacion.id_participacion]
    );

    if (premioPendiente) {
      await conn.query(
        `UPDATE premios
         SET id_boleto = COALESCE(id_boleto, ?),
             fecha_ganado = COALESCE(fecha_ganado, CURRENT_TIMESTAMP),
             fecha_finalizacion = COALESCE(fecha_finalizacion, CURRENT_TIMESTAMP),
             cantidad_bloqueo = COALESCE(cantidad_bloqueo, ?),
             unidad_bloqueo = COALESCE(unidad_bloqueo, 'dias')
         WHERE id_premio = ?`,
        [idBoleto, config.cantidad, premioPendiente.id_premio]
      );
      const [[actualizado]] = await conn.query('SELECT * FROM premios WHERE id_premio = ?', [premioPendiente.id_premio]);
      return actualizado;
    }

    const [result] = await conn.query(
      `INSERT INTO premios
        (id_usuario, id_participacion, id_boleto, estado, fecha_ganado, fecha_finalizacion,
         fecha_puede_volver_jugar, cantidad_bloqueo, unidad_bloqueo)
       VALUES (
         ?, ?, ?, 'pendiente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
         NULL,
         ?, 'dias'
       )`,
      [
        idUsuario,
        participacion.id_participacion,
        idBoleto,
        config.cantidad
      ]
    );

    const [[premio]] = await conn.query('SELECT * FROM premios WHERE id_premio = ?', [result.insertId]);
    return premio;
  }

  async function registrarReclamo(idUsuario, idBoleto = null, connection = null) {
    const conn = connection || pool;
    const config = await getConfig();
    const participacion = await asegurarParticipacionActiva(conn, idUsuario);

    let [[premio]] = await conn.query(
      `SELECT * FROM premios
       WHERE id_usuario = ? AND estado = 'pendiente'
       ORDER BY id_premio DESC LIMIT 1`,
      [idUsuario]
    );

    if (!premio) {
      premio = await registrarGanado(idUsuario, idBoleto, conn);
    }

    const fechaDesbloqueoFallback = calcularFechaDesbloqueo(new Date(), config);

    await conn.query(
      `UPDATE premios
       SET id_boleto = COALESCE(?, id_boleto),
           fecha_reclamado = COALESCE(fecha_reclamado, CURRENT_TIMESTAMP),
           fecha_puede_volver_jugar = CASE
             WHEN estado = 'pendiente' THEN ?
             ELSE COALESCE(fecha_puede_volver_jugar, ?)
           END,
           cantidad_bloqueo = COALESCE(cantidad_bloqueo, ?),
           unidad_bloqueo = COALESCE(unidad_bloqueo, 'dias'),
           motivo_bloqueo = COALESCE(motivo_bloqueo, 'reclamo_boleto'),
           estado = 'reclamado'
       WHERE id_premio = ?`,
      [
        idBoleto,
        fechaDesbloqueoFallback,
        fechaDesbloqueoFallback,
        Math.max(1, Number(config.cantidad) || DIAS_BLOQUEO_POR_DEFECTO),
        premio.id_premio
      ]
    );
    [[premio]] = await conn.query('SELECT * FROM premios WHERE id_premio = ?', [premio.id_premio]);

    await conn.query(
      `UPDATE participaciones SET estado = 'reclamado', fecha_fin = CURRENT_TIMESTAMP WHERE id_participacion = ?`,
      [premio.id_participacion || participacion.id_participacion]
    );

    const fechaPuedeVolver = premio.fecha_puede_volver_jugar
      ? new Date(premio.fecha_puede_volver_jugar)
      : null;

    return {
      premio,
      bloqueado: Boolean(config.bloqueo_activo && fechaPuedeVolver),
      motivo_bloqueo: 'reclamo_boleto',
      fecha_puede_volver: fechaPuedeVolver ? fechaPuedeVolver.toISOString() : null,
      fecha_puede_volver_texto: fechaPuedeVolver ? formatFechaMX(fechaPuedeVolver) : null,
      mensaje: fechaPuedeVolver ? buildMensajeBloqueo(fechaPuedeVolver) : null
    };
  }

  async function registrarBloqueoPorIntentos(idUsuario, idEstacion, connection = null) {
    const conn = connection || pool;
    const config = await getConfig();
    const participacion = await asegurarParticipacionActiva(conn, idUsuario);
    const [[estacion]] = await conn.query(
      'SELECT nombre FROM estaciones WHERE id_estacion = ? LIMIT 1',
      [idEstacion]
    );
    const nombreEstacion = estacion?.nombre
      ? `la estación ${estacion.nombre}`
      : `la estación ${idEstacion}`;
    const [[bloqueoActivo]] = await conn.query(
      `SELECT *
       FROM premios
       WHERE id_usuario = ?
         AND motivo_bloqueo = 'intentos'
         AND fecha_puede_volver_jugar IS NOT NULL
         AND fecha_puede_volver_jugar > CURRENT_TIMESTAMP
         AND ciclo_reiniciado_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [idUsuario]
    );
    if (bloqueoActivo) {
      const fechaActiva = new Date(bloqueoActivo.fecha_puede_volver_jugar);
      return {
        premio: bloqueoActivo,
        bloqueado: true,
        motivo_bloqueo: 'intentos',
        fecha_puede_volver: fechaActiva.toISOString(),
        fecha_puede_volver_texto: formatFechaMX(fechaActiva),
        mensaje: buildMensajeBloqueoIntentos(fechaActiva, bloqueoActivo.detalle_bloqueo || nombreEstacion)
      };
    }
    const fechaFinalizacion = new Date();
    const fechaPuedeVolver = new Date(fechaFinalizacion.getTime() + (7 * 24 * 60 * 60 * 1000)); // Exactamente 7 días

    await conn.query(
      `UPDATE participaciones SET estado = 'reclamado', fecha_fin = CURRENT_TIMESTAMP
       WHERE id_participacion = ?`,
      [participacion.id_participacion]
    );

    const [result] = await conn.query(
      `INSERT INTO premios
        (id_usuario, id_participacion, id_boleto, estado, fecha_ganado, fecha_reclamado,
         fecha_finalizacion, fecha_puede_volver_jugar, cantidad_bloqueo, unidad_bloqueo,
         motivo_bloqueo, detalle_bloqueo, id_estacion_bloqueo, intentos_realizados, fecha_bloqueo, estado_bloqueo)
       VALUES (?, ?, NULL, 'reclamado', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
         ?, ?, 7, 'dias', 'intentos', ?, ?, 3, CURRENT_TIMESTAMP, 'activo')`,
      [
        idUsuario,
        participacion.id_participacion,
        fechaFinalizacion,
        fechaPuedeVolver,
        nombreEstacion,
        idEstacion
      ]
    );

    const [[premio]] = await conn.query('SELECT * FROM premios WHERE id_premio = ?', [result.insertId]);
    return {
      premio,
      bloqueado: true,
      motivo_bloqueo: 'intentos',
      fecha_puede_volver: fechaPuedeVolver.toISOString(),
      fecha_puede_volver_texto: formatFechaMX(fechaPuedeVolver),
      mensaje: buildMensajeBloqueoIntentos(fechaPuedeVolver, nombreEstacion)
    };
  }

  async function marcarEntregado(idPremio, connection = null) {
    const conn = connection || pool;
    await conn.query(
      `UPDATE premios SET estado = 'entregado', fecha_entregado = CURRENT_TIMESTAMP WHERE id_premio = ?`,
      [idPremio]
    );
    const [[premio]] = await conn.query('SELECT * FROM premios WHERE id_premio = ?', [idPremio]);
    return premio;
  }

  async function desbloquearUsuario(idUsuario) {
    await pool.query(
      `UPDATE premios
       SET fecha_puede_volver_jugar = CURRENT_TIMESTAMP
       WHERE id_usuario = ? AND fecha_puede_volver_jugar > CURRENT_TIMESTAMP`,
      [idUsuario]
    );

    return getEstadoBloqueo(idUsuario);
  }

  async function actualizarFechaPermitida(idUsuario, nuevaFecha) {
    const fecha = new Date(nuevaFecha);
    if (Number.isNaN(fecha.getTime())) {
      throw new Error('Fecha inválida.');
    }

    const premio = await getUltimoPremioFinalizado(idUsuario);
    if (!premio) {
      throw new Error('El usuario no tiene recorridos finalizados.');
    }

    await pool.query(
      'UPDATE premios SET fecha_puede_volver_jugar = ? WHERE id_premio = ?',
      [fecha, premio.id_premio]
    );

    return getEstadoBloqueo(idUsuario);
  }

  async function aplicarConfiguracionABloqueosActivos(updatedBy = null) {
    const config = await getConfig();
    const [premios] = await pool.query(
      `SELECT id_premio, COALESCE(fecha_reclamado, fecha_finalizacion, fecha_ganado) AS fecha_finalizacion
       FROM premios
       WHERE COALESCE(fecha_reclamado, fecha_finalizacion, fecha_ganado) IS NOT NULL
         AND fecha_puede_volver_jugar IS NOT NULL
         AND fecha_puede_volver_jugar > CURRENT_TIMESTAMP`
    );

    for (const premio of premios) {
      const nuevaFecha = calcularFechaDesbloqueo(premio.fecha_finalizacion, config);
      await pool.query(
        `UPDATE premios
         SET fecha_puede_volver_jugar = ?, cantidad_bloqueo = ?, unidad_bloqueo = ?
         WHERE id_premio = ?`,
        [nuevaFecha, config.cantidad, 'dias', premio.id_premio]
      );
    }

    return { actualizados: premios.length, config };
  }

  async function listarUsuariosBloqueo() {
    const [rows] = await pool.query(
      `SELECT
         u.id_usuario,
         u.nombre,
         u.correo,
         p.id_premio,
         p.estado AS estado_premio,
         p.fecha_ganado,
         p.fecha_reclamado,
         p.fecha_entregado,
         p.fecha_finalizacion,
         p.fecha_puede_volver_jugar,
         p.motivo_bloqueo,
         p.detalle_bloqueo,
         part.fecha_inicio AS fecha_jugo,
         part.id_participacion
       FROM usuarios u
       LEFT JOIN premios p ON p.id_usuario = u.id_usuario
         AND p.id_premio = (
           SELECT p2.id_premio FROM premios p2
           WHERE p2.id_usuario = u.id_usuario
           ORDER BY COALESCE(p2.fecha_reclamado, p2.fecha_finalizacion, p2.fecha_ganado, p2.created_at) DESC
           LIMIT 1
         )
       LEFT JOIN participaciones part ON part.id_participacion = p.id_participacion
       WHERE EXISTS (
         SELECT 1 FROM premios px WHERE px.id_usuario = u.id_usuario
       )
       ORDER BY COALESCE(p.fecha_reclamado, p.fecha_finalizacion, p.fecha_ganado, u.fecha_registro) DESC`
    );

    const config = await getConfig();

    return rows.map((row) => {
      let bloqueado = false;
      let tiempoRestante = '—';
      let estadoActual = 'habilitado';

      if (row.fecha_finalizacion && row.fecha_puede_volver_jugar && (config.bloqueo_activo || row.motivo_bloqueo === 'intentos')) {
        const fechaVolver = new Date(row.fecha_puede_volver_jugar);
        const restante = msRestantes(fechaVolver);
        bloqueado = restante > 0;
        tiempoRestante = bloqueado ? formatTiempoRestante(restante) : 'Disponible';
        estadoActual = bloqueado ? 'bloqueado' : 'habilitado';
      } else if (row.estado_premio === 'pendiente') {
        estadoActual = 'premio_pendiente';
      } else if (row.estado_premio === 'entregado') {
        estadoActual = bloqueado ? 'bloqueado' : 'habilitado';
      }

      return {
        ...row,
        bloqueado,
        estado_actual: estadoActual,
        tiempo_restante: tiempoRestante
      };
    });
  }

  async function historialPremiosUsuario(idUsuario) {
    const [premios] = await pool.query(
      `SELECT p.*, b.folio
       FROM premios p
       LEFT JOIN boletos b ON b.id_boleto = p.id_boleto
       WHERE p.id_usuario = ?
       ORDER BY p.created_at DESC`,
      [idUsuario]
    );

    const [participaciones] = await pool.query(
      `SELECT * FROM participaciones WHERE id_usuario = ? ORDER BY created_at DESC`,
      [idUsuario]
    );

    return { premios, participaciones };
  }

  function middlewareVerificarBloqueo(obtenerIdUsuarioDePeticion) {
    return async (req, res, next) => {
      try {
        const idUsuario = obtenerIdUsuarioDePeticion(req);
        if (!idUsuario) return next();

        const estado = await getEstadoBloqueo(idUsuario);
        if (estado.bloqueado) {
          return res.status(403).json({
            error: 'usuario_bloqueado',
            mensaje: estado.mensaje,
            motivo_bloqueo: estado.motivo_bloqueo,
            fecha_puede_volver: estado.fecha_puede_volver,
            fecha_puede_volver_texto: estado.fecha_puede_volver_texto,
            tiempo_restante: estado.tiempo_restante
          });
        }

        req.playtimeEstado = estado;
        next();
      } catch (error) {
        console.error('Error verificando bloqueo de juego:', error.message);
        res.status(500).json({ error: 'No se pudo verificar el estado de bloqueo del juego.' });
      }
    };
  }

  return {
    TZ,
    ensureTables,
    getConfig,
    updateConfig,
    getEstadoBloqueo,
    asegurarParticipacionActiva,
    registrarGanado,
    registrarReclamo,
    registrarBloqueoPorIntentos,
    marcarEntregado,
    desbloquearUsuario,
    actualizarFechaPermitida,
    aplicarConfiguracionABloqueosActivos,
    listarUsuariosBloqueo,
    historialPremiosUsuario,
    middlewareVerificarBloqueo,
    buildMensajeBloqueo,
    buildMensajeBloqueoIntentos,
    formatFechaMX,
    formatFechaHoraMX,
    calcularFechaDesbloqueo
  };
}

module.exports = {
  DIAS_BLOQUEO_POR_DEFECTO,
  createPlaytimeBlockService,
  buildMensajeBloqueo,
  buildMensajeBloqueoIntentos,
  calcularFechaDesbloqueo,
  formatFechaMX
};
