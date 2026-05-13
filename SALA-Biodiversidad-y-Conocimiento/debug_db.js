const SUPABASE_URL = 'https://qwgaeorsymfispmtsbut.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3Z2Flb3JzeW1maXNwbXRzYnV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzODcyODUsImV4cCI6MjA3Nzk2MzI4NX0.FThZIIpz3daC9u8QaKyRTpxUeW0v4QHs5sHX2s1U1eo';

async function test() {
    console.log("--- Searching for Biodiversidad Room ---");
    try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/salas?select=*`, {
            headers: {
                'apikey': ANON_KEY,
                'Authorization': `Bearer ${ANON_KEY}`
            }
        });

        if (!resp.ok) {
            console.error("Error fetching salas:", resp.status, await resp.text());
            return;
        }

        const salas = await resp.json();
        console.log(`Total salas in table: ${salas.length}`);
        salas.forEach(s => {
            console.log(`Room: ${s.nombre} | ID: ${s.id} | Slug: ${s.slug}`);
        });

        const bio = salas.find(s => s.nombre && s.nombre.toLowerCase().includes('bio'));
        if (bio) {
            console.log("MATCH FOUND for 'bio':", bio);
        } else {
            console.log("No room name contains 'bio'.");
        }

    } catch (err) {
        console.error("Fetch Exception:", err);
    }
}

test();
