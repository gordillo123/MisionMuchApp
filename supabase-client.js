import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL =
  window.MISION_MUCH_SUPABASE_URL ||
  'https://thajrezykoictubybvkq.supabase.co';
const SUPABASE_ANON_KEY =
  window.MISION_MUCH_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoYWpyZXp5a29pY3R1YnlidmtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNzI3MzQsImV4cCI6MjA5NDg0ODczNH0.Ev0sEwjQ7978z7fb_4cK13m4uIGFC1VkhBnK-Zj3vDI';

if (SUPABASE_URL.includes('/rest/v1')) {
  console.warn('[Supabase] Usa la URL base del proyecto, no la URL /rest/v1.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = supabase;

export { supabase };
