import { createBrowserClient } from '@supabase/ssr';

// No database driver anywhere: the data layer is entirely a hosted service reached
// over HTTP. This is the shape of an app built with Lovable, Bolt or v0.
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function Page() {
  const { data } = await supabase.from('projects').select('*');
  return <pre>{JSON.stringify(data)}</pre>;
}
