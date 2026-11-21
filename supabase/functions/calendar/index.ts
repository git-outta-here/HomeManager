// HomeManager calendar feed. A calendar app subscribes to
//   /functions/v1/calendar?t=<household's private token>&who=<member id, optional>&tz=<time zone>
// and gets every open task, with repeating chores projected two months ahead.
// The token is the only key: anyone holding the link can read the feed, nothing more.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildFeed, type Row } from './feed.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

function todayIn(tz: string | null) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('t') ?? ''
  if (!/^[0-9a-f]{32,64}$/.test(token)) return new Response('Not found', { status: 404 })
  const { data: household } = await db.from('households').select('id').eq('calendar_token', token).maybeSingle()
  if (!household) return new Response('Not found', { status: 404 })

  const { data: rows, error } = await db
    .from('items')
    .select('kind, data, deleted')
    .eq('household_id', household.id)
    .eq('deleted', false)
    .in('kind', ['household', 'member', 'chore', 'task'])
    .limit(5000)
  if (error) return new Response('Calendar unavailable', { status: 500 })

  const feed = buildFeed(rows as Row[], {
    who: url.searchParams.get('who') || undefined,
    today: todayIn(url.searchParams.get('tz')),
  })
  return new Response(feed, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
})
