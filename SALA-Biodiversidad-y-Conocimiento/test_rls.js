const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qwgaeorsymfispmtsbut.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3Z2Flb3JzeW1maXNwbXRzYnV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzODcyODUsImV4cCI6MjA3Nzk2MzI4NX0.FThZIIpz3daC9u8QaKyRTpxUeW0v4QHs5sHX2s1U1eo';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function diagnostic() {
    console.log("--- Testing Ganadores Insertion ---");
    
    const testCases = [
        {
            name: "Default Values (Museo Chiapas)",
            payload: {
                nombre: "Test User",
                correo: "test@example.com",
                telefono: "1234567890",
                folio: "TEST-" + Math.random().toString(36).substring(7),
                valido_desde: new Date().toISOString(),
                valido_hasta: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                estatus: 'activo',
                tipo_entrada: 'Premio',
                ubicacion: 'Museo Chiapas'
            }
        },
        {
            name: "Custom Location (ponteduro)",
            payload: {
                nombre: "Test User",
                correo: "test@example.com",
                telefono: "1234567890",
                folio: "TEST-" + Math.random().toString(36).substring(7),
                valido_desde: new Date().toISOString(),
                valido_hasta: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                estatus: 'activo',
                tipo_entrada: 'Premio',
                ubicacion: 'ponteduro'
            }
        }
    ];

    for (const tc of testCases) {
        console.log(`\nTesting Case: ${tc.name}`);
        const { data, error } = await supabase
            .from('Ganadores')
            .insert(tc.payload)
            .select('id')
            .single();

        if (error) {
            console.error(`FAILED: ${error.message}`);
            console.error("Detail:", error.details);
            console.error("Hint:", error.hint);
        } else {
            console.log(`SUCCESS: Created ID ${data.id}`);
        }
    }
}

diagnostic();
