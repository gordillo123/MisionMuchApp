import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://dprdvtjxpdiyizrlqslu.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'sb_publishable_lsFjPHWYQGqo8vlEc01eFQ_C3ai0ysv';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = supabase;

export { supabase };
