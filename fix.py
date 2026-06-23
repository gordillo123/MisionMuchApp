import re

with open('c:/ESTADIA/MisionMuchApp/supabase-utils.js', 'r', encoding='utf-8') as f:
    content = f.read()

parts = content.split("ctaLabel: 'Ver mi recompensa'\n    });")
if len(parts) == 2:
    rest = parts[1]
    idx = rest.find('const sessionId = obtenerSessionId();')
    if idx != -1:
        rest = rest[idx:]
        
        fixed_middle = '''
  } else {
    alert(mensaje);
  }
}

async function asegurarJuegoPermitido() {
  const estado = await consultarEstadoBloqueoJuego(true);
  if (estado.bloqueado) {
    mostrarAvisoBloqueoJuego(estado);
    const error = new Error(estado.mensaje || 'usuario_bloqueado');
    error.code = 'usuario_bloqueado';
    throw error;
  }
  return estado;
}

async function manejarRespuestaBloqueoJuego(res) {
  if (res.status !== 403) return false;
  try {
    const data = await res.json();
    if (data.error === 'usuario_bloqueado') {
      invalidarCacheBloqueoJuego();
      mostrarAvisoBloqueoJuego(data);
      const error = new Error(data.mensaje || 'usuario_bloqueado');
      error.code = 'usuario_bloqueado';
      throw error;
    }
  } catch (error) {
    if (error.code === 'usuario_bloqueado') throw error;
  }
  return false;
}

async function consultarUltimaVerificacion() {
  const user = obtenerUsuarioLocal();
  const userId = user ? (user.id_usuario || user.id) : null;
  '''
        
        new_content = parts[0] + "ctaLabel: 'Ver mi recompensa'\n    });" + fixed_middle + rest
        with open('c:/ESTADIA/MisionMuchApp/supabase-utils.js', 'w', encoding='utf-8') as f:
            f.write(new_content)
        print('Fixed supabase-utils.js successfully!')
    else:
        print('Could not find const sessionId')
else:
    print('Could not find ctaLabel split')
