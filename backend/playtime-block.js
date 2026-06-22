// backend/playtime-block.js
// Sistema de bloqueo por tiempo entre participaciones

const TZ = process.env.TZ || 'America/Mexico_City';

const UNIDADES_VALIDAS = new Set(['dias', 'semanas', 'meses']);

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

function buildMensajeBloqueo(fechaPuedeVolver) {
  const { fecha, hora } = formatFechaHoraMXPartes(fechaPuedeVolver);
  return `Ya reclamaste tu premio. Podrás volver a participar el día ${fecha} a las ${hora}.`;
}

function calcularFechaDesbloqueo(fechaBase, config) {
  const base = fechaBase instanceof Date ? new Date(fechaBase.getTime()) : new Date(fechaBase);
  const cantidad = Math.max(1, Number(config.cantidad) || 1);
  const unidad = UNIDADES_VALIDAS.has(config.unidad) ? config.unidad : 'semanas';

  if (unidad === 'dias') {
    base.setDate(base.getDate() + cantidad);
  } else if (unidad === 'semanas') {
    base.setDate(base.getDate() + (cantidad * 7));
  } else if (unidad === 'meses') {
    base.setMonth(base.getMonth() + cantidad);
  }

  return base;
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
  async function ensureTables() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS configuracion_juego (
        id_config INT AUTO_INCREMENT PRIMARY KEY,
        bloqueo_activo BOOLEAN NOT NULL DEFAULT TRUE,
        cantidad INT NOT NULL DEFAULT 1,
        unidad ENUM('dias', 'semanas', 'meses') NOT NULL DEFAULT 'semanas',
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [[exists]] = await pool.query('SELECT id_config FROM configuracion_juego LIMIT 1');
    if (!exists) {
      await pool.query(
        `INSERT INTO configuracion_juego (bloqueo_activo, cantidad, unidad) VALUES (TRUE, 1, 'semanas')`
      );
    }
  }

  async function getConfig() {
    const [[row]] = await pool.query(
      'SELECT * FROM configuracion_juego ORDER BY id_config ASC LIMIT 1'
    );
    return row || { bloqueo_activo: true, cantidad: 1, unidad: 'semanas' };
  }

  async function updateConfig(data, updatedBy = null) {
    const config = await getConfig();
    const bloqueoActivo = data.bloqueo_activo !== undefined ? Boolean(data.bloqueo_activo) : Boolean(config.bloqueo_activo);
    const cantidad = Math.max(1, Number(data.cantidad ?? config.cantidad ?? 1));
    const unidad = UNIDADES_VALIDAS.has(data.unidad) ? data.unidad : (config.unidad || 'semanas');

    await pool.query(
      `UPDATE configuracion_juego
       SET bloqueo_activo = ?, cantidad = ?, unidad = ?, updated_by = ?
       WHERE id_config = ?`,
      [bloqueoActivo, cantidad, unidad, updatedBy, config.id_config]
    );

    return getConfig();
  }

  async function getUltimoPremioReclamado(idUsuario) {
    const [[premio]] = await pool.query(
      `SELECT * FROM premios
       WHERE id_usuario = ? AND fecha_reclamado IS NOT NULL
       ORDER BY fecha_reclamado DESC
       LIMIT 1`,
      [idUsuario]
    );
    return premio || null;
  }

  async function getEstadoBloqueo(idUsuario) {
    const config = await getConfig();
    const habilitado = { bloqueado: false, habilitado: true, config };

    if (!config.bloqueo_activo) {
      return { ...habilitado, motivo: 'bloqueo_desactivado' };
    }

    const premio = await getUltimoPremioReclamado(idUsuario);
    if (!premio || !premio.fecha_puede_volver_jugar) {
      return { ...habilitado, premio_pendiente: premio?.estado === 'pendiente' ? premio : null };
    }

    const fechaPuedeVolver = new Date(premio.fecha_puede_volver_jugar);
    if (Date.now() >= fechaPuedeVolver.getTime()) {
      return {
        ...habilitado,
        premio_anterior: premio,
        motivo: 'tiempo_cumplido'
      };
    }

    const restanteMs = msRestantes(fechaPuedeVolver);
    return {
      bloqueado: true,
      habilitado: false,
      config,
      premio,
      fecha_puede_volver: fechaPuedeVolver.toISOString(),
      fecha_puede_volver_texto: formatFechaHoraMX(fechaPuedeVolver),
      tiempo_restante: formatTiempoRestante(restanteMs),
      tiempo_restante_ms: restanteMs,
      mensaje: buildMensajeBloqueo(fechaPuedeVolver)
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
    const participacion = await asegurarParticipacionActiva(conn, idUsuario);

    await conn.query(
      `UPDATE participaciones SET estado = 'ganado', fecha_fin = COALESCE(fecha_fin, CURRENT_TIMESTAMP)
       WHERE id_participacion = ?`,
      [participacion.id_participacion]
    );

    const [[premioPendiente]] = await conn.query(
      `SELECT * FROM premios WHERE id_usuario = ? AND estado = 'pendiente' ORDER BY id_premio DESC LIMIT 1`,
      [idUsuario]
    );

    if (premioPendiente) {
      if (idBoleto && !premioPendiente.id_boleto) {
        await conn.query('UPDATE premios SET id_boleto = ? WHERE id_premio = ?', [idBoleto, premioPendiente.id_premio]);
      }
      return premioPendiente;
    }

    const [result] = await conn.query(
      `INSERT INTO premios (id_usuario, id_participacion, id_boleto, estado, fecha_ganado)
       VALUES (?, ?, ?, 'pendiente', CURRENT_TIMESTAMP)`,
      [idUsuario, participacion.id_participacion, idBoleto]
    );

    const [[premio]] = await conn.query('SELECT * FROM premios WHERE id_premio = ?', [result.insertId]);
    return premio;
  }

  async function registrarReclamo(idUsuario, idBoleto = null, connection = null) {
    const conn = connection || pool;
    const config = await getConfig();
    const ahora = new Date();
    const fechaPuedeVolver = calcularFechaDesbloqueo(ahora, config);

    const participacion = await asegurarParticipacionActiva(conn, idUsuario);

    let [[premio]] = await conn.query(
      `SELECT * FROM premios
       WHERE id_usuario = ? AND estado = 'pendiente'
       ORDER BY id_premio DESC LIMIT 1`,
      [idUsuario]
    );

    if (!premio) {
      const [result] = await conn.query(
        `INSERT INTO premios (id_usuario, id_participacion, id_boleto, estado, fecha_ganado, fecha_reclamado,
          fecha_puede_volver_jugar, cantidad_bloqueo, unidad_bloqueo)
         VALUES (?, ?, ?, 'reclamado', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)`,
        [
          idUsuario,
          participacion.id_participacion,
          idBoleto,
          config.bloqueo_activo ? fechaPuedeVolver : null,
          config.cantidad,
          config.unidad
        ]
      );
      [[premio]] = await conn.query('SELECT * FROM premios WHERE id_premio = ?', [result.insertId]);
    } else {
      await conn.query(
        `UPDATE premios
         SET estado = 'reclamado',
             id_boleto = COALESCE(?, id_boleto),
             fecha_reclamado = CURRENT_TIMESTAMP,
             fecha_puede_volver_jugar = ?,
             cantidad_bloqueo = ?,
             unidad_bloqueo = ?
         WHERE id_premio = ?`,
        [
          idBoleto,
          config.bloqueo_activo ? fechaPuedeVolver : null,
          config.cantidad,
          config.unidad,
          premio.id_premio
        ]
      );
      [[premio]] = await conn.query('SELECT * FROM premios WHERE id_premio = ?', [premio.id_premio]);
    }

    await conn.query(
      `UPDATE participaciones SET estado = 'reclamado', fecha_fin = CURRENT_TIMESTAMP WHERE id_participacion = ?`,
      [participacion.id_participacion]
    );

    return {
      premio,
      bloqueado: Boolean(config.bloqueo_activo),
      fecha_puede_volver: config.bloqueo_activo ? fechaPuedeVolver.toISOString() : null,
      mensaje: config.bloqueo_activo ? buildMensajeBloqueo(fechaPuedeVolver) : null
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
       WHERE id_usuario = ? AND fecha_reclamado IS NOT NULL AND fecha_puede_volver_jugar > CURRENT_TIMESTAMP`,
      [idUsuario]
    );

    await pool.query(
      `INSERT INTO participaciones (id_usuario, estado, fecha_fin)
       VALUES (?, 'habilitado', CURRENT_TIMESTAMP)`,
      [idUsuario]
    );

    return getEstadoBloqueo(idUsuario);
  }

  async function actualizarFechaPermitida(idUsuario, nuevaFecha) {
    const fecha = new Date(nuevaFecha);
    if (Number.isNaN(fecha.getTime())) {
      throw new Error('Fecha inválida.');
    }

    const premio = await getUltimoPremioReclamado(idUsuario);
    if (!premio) {
      throw new Error('El usuario no tiene premios reclamados.');
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
      `SELECT id_premio, fecha_reclamado FROM premios
       WHERE fecha_reclamado IS NOT NULL
         AND fecha_puede_volver_jugar IS NOT NULL
         AND fecha_puede_volver_jugar > CURRENT_TIMESTAMP`
    );

    for (const premio of premios) {
      const nuevaFecha = calcularFechaDesbloqueo(premio.fecha_reclamado, config);
      await pool.query(
        `UPDATE premios
         SET fecha_puede_volver_jugar = ?, cantidad_bloqueo = ?, unidad_bloqueo = ?
         WHERE id_premio = ?`,
        [nuevaFecha, config.cantidad, config.unidad, premio.id_premio]
      );
    }

    if (updatedBy) {
      await updateConfig(config, updatedBy);
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
         p.fecha_puede_volver_jugar,
         part.fecha_inicio AS fecha_jugo,
         part.id_participacion
       FROM usuarios u
       LEFT JOIN premios p ON p.id_usuario = u.id_usuario
         AND p.id_premio = (
           SELECT p2.id_premio FROM premios p2
           WHERE p2.id_usuario = u.id_usuario
           ORDER BY COALESCE(p2.fecha_reclamado, p2.fecha_ganado, p2.created_at) DESC
           LIMIT 1
         )
       LEFT JOIN participaciones part ON part.id_participacion = p.id_participacion
       WHERE EXISTS (
         SELECT 1 FROM premios px WHERE px.id_usuario = u.id_usuario
       )
       ORDER BY COALESCE(p.fecha_reclamado, p.fecha_ganado, u.fecha_registro) DESC`
    );

    const config = await getConfig();

    return rows.map((row) => {
      let bloqueado = false;
      let tiempoRestante = '—';
      let estadoActual = 'habilitado';

      if (row.fecha_reclamado && row.fecha_puede_volver_jugar && config.bloqueo_activo) {
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
    marcarEntregado,
    desbloquearUsuario,
    actualizarFechaPermitida,
    aplicarConfiguracionABloqueosActivos,
    listarUsuariosBloqueo,
    historialPremiosUsuario,
    middlewareVerificarBloqueo,
    buildMensajeBloqueo,
    formatFechaHoraMX,
    calcularFechaDesbloqueo
  };
}

module.exports = { createPlaytimeBlockService };
