// HomeManager reminders. Runs on Supabase (Edge Function), called once an hour by a schedule.
//   GET            returns the public key a phone needs to register for notifications
//   POST {}        sends today's reminder to every phone whose chosen hour it now is
//   POST {test}    sends a test notification to one phone straight away
//   POST {notify}  a signed-in household member nudges their partner about a task, or tells them
//                  one is done: { household, from (member id), kind: 'nudge' | 'done', task (id) }
// It needs no secrets of its own: the signing keys are created on first use and kept in the
// push_config table, which only this function can read.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { localNow, reminderFor, type Row } from './message.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function signingKeys() {
  const read = () => db.from('push_config').select('public_key, private_key').maybeSingle()
  let { data, error } = await read()
  if (error) throw error
  if (!data) {
    const k = webpush.generateVAPIDKeys()
    await db
      .from('push_config')
      .upsert({ id: true, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: 'id', ignoreDuplicates: true })
    ;({ data, error } = await read())
    if (error || !data) throw error ?? new Error('Could not store signing keys')
  }
  return data
}

type Sub = { endpoint: string; household_id: string; member_id: string; p256dh: string; auth: string; hour: number; tz: string; last_sent: string | null }

async function send(sub: Sub, message: { title: string; body: string }, keys: { public_key: string; private_key: string }) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(message),
      {
        TTL: 3 * 60 * 60,
        vapidDetails: { subject: Deno.env.get('SUPABASE_URL')!, publicKey: keys.public_key, privateKey: keys.private_key },
      },
    )
    return true
  } catch (e) {
    // The phone removed the app or switched notifications off: forget its address.
    const status = (e as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    else console.error('push failed', status, (e as Error).message)
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const keys = await signingKeys()
    if (req.method === 'GET') return json({ publicKey: keys.public_key })

    const body = await req.json().catch(() => ({}))
    if (typeof body.test === 'string') {
      const { data: sub } = await db.from('push_subscriptions').select('*').eq('endpoint', body.test).maybeSingle()
      if (!sub) return json({ error: 'Unknown phone' }, 404)
      const ok = await send(sub, { title: 'HomeManager', body: 'Reminders are working on this phone.' }, keys)
      return json({ sent: ok ? 1 : 0 }, ok ? 200 : 502)
    }

    if (body.notify) {
      const { household, from, kind, task } = body.notify as Record<string, string>
      if (!household || !from || !task || (kind !== 'nudge' && kind !== 'done')) return json({ error: 'Bad request' }, 400)
      // Only someone signed in on a phone that belongs to this household may notify it.
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
      const { data: who } = await db.auth.getUser(token)
      if (!who?.user) return json({ error: 'Not signed in' }, 401)
      const { data: member } = await db
        .from('household_members')
        .select('user_id')
        .eq('household_id', household)
        .eq('user_id', who.user.id)
        .maybeSingle()
      if (!member) return json({ error: 'Not in this household' }, 403)

      const { data: rows } = await db
        .from('items')
        .select('id, data')
        .eq('household_id', household)
        .eq('deleted', false)
        .in('id', [from, task])
      const name = (rows?.find((r) => r.id === from)?.data as { name?: string } | undefined)?.name
      const t = rows?.find((r) => r.id === task)?.data as { title?: string; icon?: string } | undefined
      if (!name || !t?.title) return json({ error: 'Unknown task' }, 404)

      let query = db.from('push_subscriptions').select('*').eq('household_id', household).neq('member_id', from)
      if (kind === 'done') query = query.eq('done_alerts', true)
      const { data: targets, error: e } = await query
      if (e) throw e
      const message =
        kind === 'nudge'
          ? { title: `👋 ${name} nudged you`, body: `${t.icon ?? ''} ${t.title}`.trim() }
          : { title: `${name} finished: ${t.icon ?? ''} ${t.title}`.trim(), body: 'Open HomeManager to say thanks.' }
      let sent = 0
      for (const sub of targets as Sub[]) if (await send(sub, message, keys)) sent++
      return json({ sent })
    }

    const { data: subs, error } = await db.from('push_subscriptions').select('*')
    if (error) throw error
    const households = new Map<string, Row[]>()
    let sent = 0
    for (const sub of subs as Sub[]) {
      const { date, hour } = localNow(sub.tz)
      if (hour !== sub.hour || sub.last_sent === date) continue
      if (!households.has(sub.household_id)) {
        const { data: rows, error: e } = await db
          .from('items')
          .select('kind, data, deleted')
          .eq('household_id', sub.household_id)
          .in('kind', ['household', 'chore', 'task'])
          .eq('deleted', false)
          .limit(5000)
        if (e) throw e
        households.set(sub.household_id, rows as Row[])
      }
      const message = reminderFor(households.get(sub.household_id)!, sub.member_id, date)
      if (message && (await send(sub, message, keys))) sent++
      await db.from('push_subscriptions').update({ last_sent: date }).eq('endpoint', sub.endpoint)
    }
    return json({ sent })
  } catch (e) {
    console.error(e)
    return json({ error: 'Reminders failed' }, 500)
  }
})
