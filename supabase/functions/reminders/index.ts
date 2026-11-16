// HomeManager reminders. Runs on Supabase (Edge Function), called once an hour by a schedule.
//   GET            returns the public key a phone needs to register for notifications
//   POST {}        sends today's reminder to every phone whose chosen hour it now is
//   POST {test}    sends a test notification to one phone straight away
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
