// All app data lives behind this module. It persists to this device's
// localStorage today; cloud sync can replace `load`/`save` without touching the screens.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { addDays, bonusDay, bounty, firstDue, nextDue, ymd } from './logic'
import type { Assignment, Chore, Member, Repeat, Reward, State, Task } from './types'

const KEY = 'homemanager.v1'
const ME_KEY = 'homemanager.me'

function load(): State | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as State) : null
  } catch {
    return null
  }
}

function save(s: State | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable: keep working in memory */
  }
}

let snap: { state: State | null; me: string | null } = {
  state: load(),
  me: (() => {
    try {
      return localStorage.getItem(ME_KEY)
    } catch {
      return null
    }
  })(),
}
const listeners = new Set<() => void>()
export const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const getState = () => snap.state

/** Replaces all data with a version merged from the server (used by sync only). */
export const replaceState = (state: State) => commit(state)

function commit(state: State | null, me = snap.me) {
  snap = { state, me }
  save(state)
  listeners.forEach((l) => l())
}

function update(fn: (s: State) => State) {
  if (snap.state) commit(fn(snap.state))
}

export const useStore = () => useSyncExternalStore(subscribe, () => snap)

/** Today's date, refreshed when the app comes back to the foreground. */
export function useToday() {
  const [today, setToday] = useState(ymd())
  useEffect(() => {
    const tick = () => setToday(ymd())
    document.addEventListener('visibilitychange', tick)
    const timer = setInterval(tick, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', tick)
      clearInterval(timer)
    }
  }, [])
  return today
}

// randomUUID needs https or localhost; the fallback covers plain-http testing over wifi.
const id = () =>
  crypto.randomUUID?.() ??
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')

// ---- helpers ----

function assigneeFor(a: Assignment, members: Member[], prev: string | null | undefined) {
  if (a.kind === 'member') return a.memberId
  if (a.kind === 'anyone') return null
  const i = members.findIndex((m) => m.id === prev)
  return members[(i + 1) % members.length].id
}

function occurrence(c: Chore, members: Member[], due: string, prev?: string | null): Task {
  return {
    id: id(),
    choreId: c.id,
    title: c.title,
    icon: c.icon,
    points: c.points,
    due,
    assigneeId: assigneeFor(c.assignment, members, prev),
  }
}

// ---- setup ----

export type ChoreInput = Omit<Chore, 'id'>

const EXAMPLE_CHORES: ChoreInput[] = [
  { title: 'Dishes', icon: '🍽️', points: 3, repeat: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] }, assignment: { kind: 'alternate' } },
  { title: 'Laundry', icon: '🧺', points: 5, repeat: { kind: 'interval', everyDays: 3 }, assignment: { kind: 'anyone' } },
  { title: 'Take out the bins', icon: '🗑️', points: 2, repeat: { kind: 'weekly', days: [2] }, assignment: { kind: 'anyone' } },
  { title: 'Vacuum', icon: '🧹', points: 5, repeat: { kind: 'weekly', days: [6] }, assignment: { kind: 'alternate' } },
  { title: 'Clean the bathroom', icon: '🚿', points: 8, repeat: { kind: 'weekly', days: [0] }, assignment: { kind: 'alternate' } },
]

const EXAMPLE_REWARDS: Omit<Reward, 'id'>[] = [
  { title: 'Pick the movie', icon: '🎬', cost: 20 },
  { title: 'Sleep in on Saturday', icon: '😴', cost: 40 },
  { title: 'Skip one chore', icon: '🎟️', cost: 30 },
  { title: 'Choose the restaurant', icon: '🍜', cost: 60 },
]

export const MEMBER_COLORS = ['#F2684A', '#1E9E94']

export function setupHousehold(names: string[], withExamples: boolean) {
  const members: Member[] = names.map((name, i) => ({ id: id(), name, color: MEMBER_COLORS[i] }))
  const today = ymd()
  const chores: Chore[] = withExamples ? EXAMPLE_CHORES.map((c) => ({ ...c, id: id() })) : []
  commit(
    {
      household: { weeklyGoal: 100, goalReward: 'Takeaway night' },
      members,
      chores,
      tasks: chores.map((c) => occurrence(c, members, firstDue(c.repeat, today))),
      rewards: withExamples ? EXAMPLE_REWARDS.map((r) => ({ ...r, id: id() })) : [],
      redemptions: [],
    },
    members[0].id,
  )
  setMe(members[0].id)
}

export function setMe(memberId: string) {
  try {
    localStorage.setItem(ME_KEY, memberId)
  } catch {
    /* ignore */
  }
  commit(snap.state, memberId)
}

export function resetAll() {
  try {
    localStorage.removeItem(ME_KEY)
  } catch {
    /* ignore */
  }
  commit(null, null)
}

export const updateHousehold = (patch: Partial<State['household']>) =>
  update((s) => ({ ...s, household: { ...s.household, ...patch } }))

// ---- chores ----

export function addChore(input: ChoreInput) {
  update((s) => {
    const chore: Chore = { ...input, id: id() }
    return {
      ...s,
      chores: [...s.chores, chore],
      tasks: [...s.tasks, occurrence(chore, s.members, firstDue(chore.repeat, ymd()))],
    }
  })
}

const sameRepeat = (a: Repeat, b: Repeat) => JSON.stringify(a) === JSON.stringify(b)

export function updateChore(choreId: string, input: ChoreInput) {
  update((s) => {
    const old = s.chores.find((c) => c.id === choreId)
    if (!old) return s
    const chore: Chore = { ...old, ...input, id: choreId }
    const reschedule = !sameRepeat(old.repeat, chore.repeat)
    const reassign = JSON.stringify(old.assignment) !== JSON.stringify(chore.assignment)
    return {
      ...s,
      chores: s.chores.map((c) => (c.id === choreId ? chore : c)),
      // Only the open occurrence follows the edit; history keeps what was true then.
      tasks: s.tasks.map((t) =>
        t.choreId !== choreId || t.completedAt
          ? t
          : {
              ...t,
              title: chore.title,
              icon: chore.icon,
              points: chore.points,
              due: reschedule ? firstDue(chore.repeat, ymd()) : t.due,
              assigneeId: reassign ? assigneeFor(chore.assignment, s.members, null) : t.assigneeId,
            },
      ),
    }
  })
}

export function deleteChore(choreId: string) {
  update((s) => ({
    ...s,
    chores: s.chores.filter((c) => c.id !== choreId),
    tasks: s.tasks.filter((t) => t.choreId !== choreId || t.completedAt),
  }))
}

/** Pausing hides a chore's open task; resuming reschedules it from today. */
export function setChorePaused(choreId: string, paused: boolean) {
  update((s) => {
    const chore = s.chores.find((c) => c.id === choreId)
    if (!chore) return s
    return {
      ...s,
      chores: s.chores.map((c) => (c.id === choreId ? { ...c, paused: paused || undefined } : c)),
      tasks: paused
        ? s.tasks
        : s.tasks.map((t) =>
            t.choreId === choreId && !t.completedAt ? { ...t, due: firstDue(chore.repeat, ymd()) } : t,
          ),
    }
  })
}

/** Holiday mode pauses every chore. Switching it off gives everything a fresh start from today. */
export function setHoliday(on: boolean) {
  update((s) => {
    const today = ymd()
    const since = s.household.pausedSince
    if (on) return since ? s : { ...s, household: { ...s.household, pausedSince: today } }
    if (!since) return s
    const lastDay = addDays(today, -1)
    return {
      ...s,
      household: {
        ...s.household,
        pausedSince: undefined,
        holidays: lastDay >= since ? [...(s.household.holidays ?? []), [since, lastDay]] : s.household.holidays,
      },
      tasks: s.tasks.map((t) => {
        if (t.completedAt || t.due >= today) return t
        const chore = s.chores.find((c) => c.id === t.choreId)
        if (chore) return { ...t, due: firstDue(chore.repeat, today) }
        // One-offs that came due during the holiday are due now, with no bonus for the time away.
        return t.due >= since ? { ...t, due: today } : t
      }),
    }
  })
}

// ---- tasks ----

export function addOneOff(input: Pick<Task, 'title' | 'icon' | 'points' | 'due' | 'assigneeId'>) {
  update((s) => ({ ...s, tasks: [...s.tasks, { ...input, id: id() }] }))
}

/** Marks a task done for `memberId` and returns the points awarded. */
export function completeTask(taskId: string, memberId: string) {
  let awarded = 0
  update((s) => {
    const t = s.tasks.find((x) => x.id === taskId)
    if (!t || t.completedAt) return s
    const today = ymd()
    awarded = t.points + bounty(t, bonusDay(s.household, today))
    const tasks = s.tasks.map((x) =>
      x.id === taskId
        ? { ...x, completedBy: memberId, completedAt: new Date().toISOString(), pointsAwarded: awarded }
        : x,
    )
    const chore = s.chores.find((c) => c.id === t.choreId)
    if (chore) tasks.push(occurrence(chore, s.members, nextDue(chore.repeat, t.due, today), t.assigneeId))
    return { ...s, tasks }
  })
  return awarded
}

/** Undo a completion. The occurrence it spawned is removed so the chore has one open task. */
export function uncompleteTask(taskId: string) {
  update((s) => {
    const t = s.tasks.find((x) => x.id === taskId)
    if (!t) return s
    return {
      ...s,
      tasks: s.tasks
        .filter((x) => x.id === taskId || !t.choreId || x.choreId !== t.choreId || x.completedAt)
        .map((x) =>
          x.id === taskId
            ? { ...x, completedBy: undefined, completedAt: undefined, pointsAwarded: undefined, thanks: undefined }
            : x,
        ),
    }
  })
}

/** Skip this occurrence of a chore (no points) and schedule the next one. */
export function skipTask(taskId: string) {
  update((s) => {
    const t = s.tasks.find((x) => x.id === taskId)
    const chore = s.chores.find((c) => c.id === t?.choreId)
    if (!t || !chore) return s
    return {
      ...s,
      tasks: [
        ...s.tasks.filter((x) => x.id !== taskId),
        occurrence(chore, s.members, nextDue(chore.repeat, t.due, ymd()), t.assigneeId),
      ],
    }
  })
}

/** Adds or removes `memberId`'s thanks on a completed task. */
export function toggleThanks(taskId: string, memberId: string) {
  update((s) => ({
    ...s,
    tasks: s.tasks.map((t) => {
      if (t.id !== taskId) return t
      const had = t.thanks?.includes(memberId)
      const thanks = had ? t.thanks!.filter((m) => m !== memberId) : [...(t.thanks ?? []), memberId]
      return { ...t, thanks: thanks.length ? thanks : undefined }
    }),
  }))
}

export const deleteTask = (taskId: string) =>
  update((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== taskId) }))

// ---- rewards ----

export const addReward = (r: Omit<Reward, 'id'>) =>
  update((s) => ({ ...s, rewards: [...s.rewards, { ...r, id: id() }] }))

export const deleteReward = (rewardId: string) =>
  update((s) => ({ ...s, rewards: s.rewards.filter((r) => r.id !== rewardId) }))

export function redeem(rewardId: string, memberId: string) {
  update((s) => {
    const r = s.rewards.find((x) => x.id === rewardId)
    if (!r) return s
    return {
      ...s,
      redemptions: [
        ...s.redemptions,
        { id: id(), title: r.title, icon: r.icon, cost: r.cost, memberId, at: new Date().toISOString() },
      ],
    }
  })
}

export const undoRedemption = (redemptionId: string) =>
  update((s) => ({ ...s, redemptions: s.redemptions.filter((r) => r.id !== redemptionId) }))
