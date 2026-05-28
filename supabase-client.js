// supabase-client.js
// RESPALDO DE SUPABASE - Reemplazado por Backend MySQL Local en Express
// Se conserva este archivo únicamente como respaldo y compatibilidad.

console.log('ℹ️ Supabase ha sido desactivado. Las peticiones ahora se redirigen a la API Express local.');

// Mock inofensivo para evitar errores de importación en el frontend legacy
const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    signInWithOAuth: async () => ({ data: {}, error: new Error('Supabase Auth desactivado. Usa Google Login local.') }),
    signOut: async () => ({ error: null })
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: null, error: null })
      }),
      order: () => ({
        limit: async () => ({ data: [], error: null })
      })
    })
  })
};

window.supabase = supabase;

export { supabase };
