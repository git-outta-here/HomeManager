// Pure logic for sync: turning app state into per-entity rows and reconciling
// this device's rows with the server's. No network or storage in here.
import type { State } from './types'

export type Kind = 'household' | 'member' | 'chore' | 'task' | 'reward' | 'redemption'

/** A row as stored on the server. */
export type RemoteRow = { id: string; kind: string; data: unknown; deleted: boolean }

/** This device's view of one entity: its kind and canonical JSON. */
export type Entry = { kind: Kind; json: string }
export type Items = Map<string, Entry>
/** What the server is known to hold, as of the last successful push or pull. */
export type Base = Record<string, Entry>

export const HOUSEHOLD_ID = 'household'

/** JSON with sorted keys, so the same data always compares equal (Postgres reorders jsonb keys). */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

export function toItems(s: State): Items {
  const items: Items = new Map()
  const put = (kind: Kind, id: string, data: unknown) => items.set(id, { kind, json: canon(data) })
  put('household', HOUSEHOLD_ID, s.household)
  s.members.forEach((m, i) => put('member', m.id, { ...m, order: i }))
  s.chores.forEach((c) => put('chore', c.id, c))
  s.tasks.forEach((t) => put('task', t.id, t))
  s.rewards.forEach((r) => put('reward', r.id, r))
  s.redemptions.forEach((r) => put('redemption', r.id, r))
  return items
}

export function fromItems(items: Items): State {
  const s: State = {
    household: { weeklyGoal: 100, goalReward: '' },
    members: [],
    chores: [],
    tasks: [],
    rewards: [],
    redemptions: [],
  }
  for (const { kind, json } of items.values()) {
    const data = JSON.parse(json)
    if (kind === 'household') s.household = data
    else if (kind === 'member') s.members.push(data)
    else if (kind === 'chore') s.chores.push(data)
    else if (kind === 'task') s.tasks.push(data)
    else if (kind === 'reward') s.rewards.push(data)
    else if (kind === 'redemption') s.redemptions.push(data)
  }
  // Member order decides whose turn comes first, so it must match on both phones.
  const order = (m: object) => (m as { order?: number }).order ?? 0
  s.members.sort((a, b) => order(a) - order(b))
  return s
}

/**
 * Applies server rows to this device's items, in place. A row is taken only where
 * this device has no unsent change of its own; otherwise the local version stands
 * and will be pushed. Returns whether `local` changed.
 */
export function merge(local: Items, base: Base, remote: RemoteRow[]): boolean {
  let changed = false
  for (const r of remote) {
    const theirs = r.deleted ? null : canon(r.data)
    const mine = local.get(r.id)?.json ?? null
    const known = base[r.id]?.json ?? null
    if (mine === theirs) {
      // Already in agreement: just record what the server holds.
      if (theirs === null) delete base[r.id]
      else base[r.id] = { kind: r.kind as Kind, json: theirs }
    } else if (mine === known) {
      // No unsent local change: take theirs.
      if (theirs === null) {
        local.delete(r.id)
        delete base[r.id]
      } else {
        const entry = { kind: r.kind as Kind, json: theirs }
        local.set(r.id, entry)
        base[r.id] = entry
      }
      changed = true
    }
    // Otherwise this device has an unsent change; keep it.
  }
  return changed
}

export type Outgoing = { id: string; kind: Kind; json: string | null }

/** Rows this device still needs to send: edits, additions, and deletions (json null). */
export function pending(local: Items, base: Base): Outgoing[] {
  const out: Outgoing[] = []
  for (const [id, e] of local) if (base[id]?.json !== e.json) out.push({ id, kind: e.kind, json: e.json })
  for (const id of Object.keys(base)) if (!local.has(id)) out.push({ id, kind: base[id].kind, json: null })
  return out
}

/** Records that `sent` reached the server. */
export function acknowledge(base: Base, sent: Outgoing[]) {
  for (const r of sent) {
    if (r.json === null) delete base[r.id]
    else base[r.id] = { kind: r.kind, json: r.json }
  }
}
