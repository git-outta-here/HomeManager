// HomeManager for Siri Shortcuts. A shortcut on the phone calls
//   POST /functions/v1/shortcut?t=<household's private token>&who=<member id>&tz=<time zone>
//        with JSON { "title": "return the shoes on Friday" }   adds a one-off task
//   GET  the same address with &list=1                         reads out what is due today
// and gets back one plain sentence for Siri to speak. The token is the only key.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { parseSpoken, sayDay, sayList } from './parse.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const say = (text: string, status = 200) =>
  new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

function todayIn(tz: string | null) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

type Task = { title: string; due: string; assigneeId: string | null; choreId?: string; completedAt?: string }

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('t') ?? ''
    if (!/^[0-9a-f]{32,64}$/.test(token)) return say('That HomeManager link is not valid.', 404)
    const { data: household } = await db.from('households').select('id').eq('shortcut_token', token).maybeSingle()
    if (!household) return say('That HomeManager link is not valid.', 404)

    const { data: rows, error } = await db
      .from('items')
      .select('kind, data')
      .eq('household_id', household.id)
      .eq('deleted', false)
      .in('kind', ['household', 'member', 'chore', 'task'])
      .limit(5000)
    if (error) throw error
    const of = <T>(kind: string) => rows.filter((r) => r.kind === kind).map((r) => r.data as T)
    const members = of<{ id: string; name: string }>('member')
    const who = url.searchParams.get('who') ?? undefined
    const today = todayIn(url.searchParams.get('tz'))

    if (url.searchParams.has('list')) {
      const settings = of<{ pausedSince?: string }>('household')[0] ?? {}
      const paused = new Set(of<{ id: string; paused?: boolean }>('chore').filter((c) => c.paused).map((c) => c.id))
      const waiting = of<Task>('task')
        .filter(
          (t) =>
            !t.completedAt &&
            t.due <= today &&
            (!who || !t.assigneeId || t.assigneeId === who) &&
            !(t.choreId && (settings.pausedSince || paused.has(t.choreId))),
        )
        .sort((a, b) => a.due.localeCompare(b.due))
      return say(sayList(waiting.map((t) => t.title), waiting.filter((t) => t.due < today).length))
    }

    // The words can arrive as JSON, as a form field, or in the address.
    let spoken = url.searchParams.get('title') ?? ''
    if (!spoken && req.method === 'POST') {
      const raw = await req.text()
      try {
        spoken = String(JSON.parse(raw).title ?? '')
      } catch {
        spoken = new URLSearchParams(raw).get('title') ?? raw
      }
    }
    const parsed = parseSpoken(spoken.slice(0, 200), today, members, who)
    if (!parsed.title) return say('I did not catch what to add.', 400)

    const id = crypto.randomUUID()
    const { error: failed } = await db.from('items').insert({
      household_id: household.id,
      id,
      kind: 'task',
      data: { id, title: parsed.title, icon: '✅', points: 3, due: parsed.due, assigneeId: parsed.assigneeId },
    })
    if (failed) throw failed
    const name = members.find((m) => m.id === parsed.assigneeId)?.name
    return say(`Added ${parsed.title}, due ${sayDay(parsed.due, today)}${name ? `, for ${name}` : ''}.`)
  } catch (e) {
    console.error(e)
    return say('HomeManager could not do that just now.', 500)
  }
})
