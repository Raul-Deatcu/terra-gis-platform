import { createClient } from '@supabase/supabase-js';

// Acestea le găsești în Supabase -> Project Settings -> API
const supabaseUrl = 'https://yhhiuembkkelycdhhcub.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloaGl1ZW1ia2tlbHljZGhoY3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTIwMDEsImV4cCI6MjA4NTIyODAwMX0.53pJq4P1rgqVPQr0J-4Hd2iV8rPDLfj7o_LyjlTiBXc';

export const supabase = createClient(supabaseUrl, supabaseKey);