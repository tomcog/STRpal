// Supabase Client
const SUPABASE_URL = 'https://tmrbzyrnuzwjrqvflgvb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtcmJ6eXJudXp3anJxdmZsZ3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MzMxMTgsImV4cCI6MjA4ODQwOTExOH0.n6VPVqUoXo0mzM8zsoFzZpo7bftrGXUFVlPAIS0nbqA';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  }
});

// Helper to upload a file to Supabase Storage
async function uploadPhoto(bucket, file) {
  const ext = file.name.split('.').pop();
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { data, error } = await sb.storage.from(bucket).upload(name, file, {
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  const { data: urlData } = sb.storage.from(bucket).getPublicUrl(name);
  return urlData.publicUrl;
}
