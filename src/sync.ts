// Keeps this device's data in step with the household's copy in Supabase.
// With no Supabase settings in the environment, sync is off and the app is local-only.
import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { getState, replaceState, subscribe as onStoreChange } from './store'
import { acknowledge, fromItems, merge, pending, toItems, type Base, type Items, type RemoteRow } from './syncMerge'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export const syncConfigured = !!(URL && KEY)
const sb = syncConfigured ? createClient(URL!, KEY!) : null

const LINK_KEY = 'homemanager.household'
const BASE_KEY = 'homemanager.synced'

type Link = { id: string; code: string }

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

let link = read<Link>(LINK_KEY)
let base: Base = read<Base>(BASE_KEY) ?? {}
let channel: RealtimeChannel | null = null

/** For reminders, which store this phone's notification address next to the household. */
export const syncClient = () => sb
export const linkedHousehold = () => link?.id ?? null

// ---- status, for the settings screen ----

/** off: not configured. unlinked: configured but this device has no household yet. */
export type SyncStatus = 'off' | 'unlinked' | 'connecting' | 'live' | 'offline'

let view: { status: SyncStatus; code: string | null } = {
  status: !syncConfigured ? 'off' : link ? 'connecting' : 'unlinked',
  code: link?.code ?? null,
}
const watchers = new Set<() => void>()

function setStatus(status: SyncStatus) {
  view = { status, code: link?.code ?? null }
  watchers.forEach((w) => w())
}

export const useSync = () =>
  useSyncExternalStore(
    (w) => {
      watchers.add(w)
      return () => watchers.delete(w)
    },
    () => view,
  )

// ---- talking to the server ----

async function ensureSession() {
  const { data } = await sb!.auth.getSession()
  if (data.session) return
  const { error } = await sb!.auth.signInAnonymously()
  if (error) throw error
}

function applyRemote(rows: RemoteRow[]) {
  const state = getState()
  const local: Items = state ? toItems(state) : new Map()
  const changed = merge(local, base, rows)
  write(BASE_KEY, base)
  if (!changed) return
  const next = fromItems(local)
  if (next.members.length) replaceState(next)
}

async function pull() {
  const rows: RemoteRow[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await sb!
      .from('items')
      .select('id, kind, data, deleted')
      .eq('household_id', link!.id)
      .order('id')
      .range(from, from + page - 1)
    if (error) throw error
    rows.push(...(data as RemoteRow[]))
    if (data.length < page) break
  }
  applyRemote(rows)
}

let pushing = false
let pushAgain = false

async function push() {
  const state = getState()
  if (!sb || !link || !state) return
  if (pushing) {
    pushAgain = true
    return
  }
  const out = pending(toItems(state), base)
  if (!out.length) return
  pushing = true
  const householdId = link.id
  try {
    const now = new Date().toISOString()
    for (let i = 0; i < out.length; i += 500) {
      const batch = out.slice(i, i + 500)
      const { error } = await sb.from('items').upsert(
        batch.map((r) => ({
          household_id: householdId,
          id: r.id,
          kind: r.kind,
          data: r.json === null ? {} : JSON.parse(r.json),
          deleted: r.json === null,
          updated_at: now,
        })),
      )
      if (error) throw error
      if (link?.id !== householdId) return // disconnected while sending
      acknowledge(base, batch)
      write(BASE_KEY, base)
    }
    setStatus('live')
  } catch {
    setStatus('offline')
  } finally {
    pushing = false
    if (pushAgain) {
      pushAgain = false
      void push()
    }
  }
}

async function resync() {
  if (!sb || !link) return
  if (!channel) return connect()
  try {
    await pull()
    await push()
    setStatus('live')
  } catch {
    setStatus('offline')
  }
}

async function connect() {
  if (!sb || !link) return
  setStatus('connecting')
  try {
    await ensureSession()
    // Re-joining is harmless and repairs membership if this device's sign-in was replaced.
    const { error } = await sb.rpc('join_household', { code: link.code })
    if (error) throw error
    if (channel) void sb.removeChannel(channel)
    channel = sb
      .channel(`items:${link.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `household_id=eq.${link.id}` },
        (payload) => {
          const row = payload.new as Partial<RemoteRow>
          if (row && typeof row.id === 'string') applyRemote([row as RemoteRow])
        },
      )
      // Each (re)subscription catches up on anything missed while disconnected.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void resync()
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setStatus('offline')
      })
  } catch {
    channel = null
    setStatus('offline')
  }
}

// ---- public actions ----

function setLink(next: Link | null) {
  link = next
  base = {}
  write(LINK_KEY, next)
  write(BASE_KEY, null)
}

/** Puts this device's data online as a new household and returns nothing; the invite code appears in settings. */
export async function createHousehold() {
  if (!sb || link) return
  setStatus('connecting')
  try {
    await ensureSession()
    const { data, error } = await sb.rpc('create_household')
    if (error) throw error
    setLink({ id: data.id, code: data.join_code })
    await connect()
  } catch {
    setStatus(link ? 'offline' : 'unlinked')
    throw new Error('Could not reach the sync server. Check your connection and try again.')
  }
}

/** Joins an existing household by invite code and loads its data onto this device. */
export async function joinHousehold(code: string) {
  if (!sb) return
  await ensureSession().catch(() => {
    throw new Error('Could not reach the sync server. Check your connection and try again.')
  })
  const { data, error } = await sb.rpc('join_household', { code })
  if (error) throw new Error(/No household/.test(error.message) ? 'No household has that code.' : 'Could not join. Try again.')
  setLink({ id: data as string, code: code.trim().toUpperCase() })
  try {
    await pull()
  } catch {
    setLink(null)
    throw new Error('Joined, but could not load the household. Try again.')
  }
  if (!getState()) {
    setLink(null)
    setStatus('unlinked')
    throw new Error('That household has no data yet. Finish setting it up on the first phone.')
  }
  await connect()
}

/** Stops syncing on this device. The household's data stays online for the other phone. */
export function disconnect() {
  if (channel && sb) void sb.removeChannel(channel)
  channel = null
  setLink(null)
  setStatus(syncConfigured ? 'unlinked' : 'off')
}

export const retrySync = () => void resync()

export function initSync() {
  if (!sb) return
  let timer: ReturnType<typeof setTimeout>
  onStoreChange(() => {
    clearTimeout(timer)
    timer = setTimeout(() => void push(), 250)
  })
  window.addEventListener('online', () => void resync())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void resync()
  })
  void connect()
}
