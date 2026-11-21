// Daily reminders as push notifications. The phone registers a notification address with the
// household; a scheduled function on the sync server sends the reminder at the chosen hour.
import { useSyncExternalStore } from 'react'
import { linkedHousehold, syncClient } from './sync'

const KEY = 'homemanager.reminder'
type Saved = { hour: number; endpoint: string; memberId: string; doneAlerts?: boolean }

/** ok: can be switched on. install: iPhone needs the Home Screen app. blocked: notifications denied. */
export type ReminderAvailability = 'ok' | 'nosync' | 'install' | 'unsupported' | 'blocked'

function load(): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}

let saved = load()
const watchers = new Set<() => void>()

function save(next: Saved | null) {
  saved = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
  watchers.forEach((w) => w())
}

/** The hour (0 to 23) this phone is reminded at, or null when reminders are off. */
export const useReminderHour = () =>
  useSyncExternalStore(
    (w) => {
      watchers.add(w)
      return () => watchers.delete(w)
    },
    () => saved?.hour ?? null,
  )

/** Whether this phone is also told when the other person finishes something. */
export const useDoneAlerts = () =>
  useSyncExternalStore(
    (w) => {
      watchers.add(w)
      return () => watchers.delete(w)
    },
    () => !!saved?.doneAlerts,
  )

export async function setDoneAlerts(on: boolean) {
  if (!saved) return
  const { error } = await syncClient()!.from('push_subscriptions').update({ done_alerts: on }).eq('endpoint', saved.endpoint)
  if (error) throw new Error('Could not save that. Try again in a moment.')
  save({ ...saved, doneAlerts: on || undefined })
}

/** True when this device is linked to a household, so the other phone can be notified. */
export const canNotify = () => !!syncClient() && !!linkedHousehold()

/**
 * Sends the other person a notification about a task: a nudge to do it, or word that it is done.
 * Resolves to how many phones it reached (0 when they have not switched reminders on).
 */
export async function notifyPartner(kind: 'nudge' | 'done', taskId: string, fromMemberId: string) {
  const sb = syncClient()
  const household = linkedHousehold()
  if (!sb || !household) return 0
  const { data, error } = await sb.functions.invoke('reminders', {
    body: { notify: { household, from: fromMemberId, kind, task: taskId } },
  })
  if (error) throw new Error('Could not send that. Check your connection and try again.')
  return (data?.sent as number) ?? 0
}

export function reminderAvailability(): ReminderAvailability {
  if (!syncClient() || !linkedHousehold()) return 'nosync'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
    return ios && !(navigator as { standalone?: boolean }).standalone ? 'install' : 'unsupported'
  }
  return Notification.permission === 'denied' ? 'blocked' : 'ok'
}

function keyBytes(base64url: string) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=')
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
}

const SERVER_NOT_READY = 'Reminders are not set up on the sync server yet.'

export async function enableReminders(hour: number, memberId: string) {
  const sb = syncClient()
  const household = linkedHousehold()
  if (!sb || !household) throw new Error('Turn on sync first.')
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('Reminders work in the installed app, not in this preview.')
  if ((await Notification.requestPermission()) !== 'granted')
    throw new Error('Notifications are blocked for this app. Allow them in your phone settings, then try again.')

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const { data, error } = await sb.functions.invoke('reminders', { method: 'GET' })
    if (error || !data?.publicKey) throw new Error(SERVER_NOT_READY)
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.publicKey) })
  }
  const keys = sub.toJSON().keys ?? {}
  const { error } = await sb.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    household_id: household,
    member_id: memberId,
    p256dh: keys.p256dh,
    auth: keys.auth,
    hour,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    last_sent: null,
    done_alerts: false,
  })
  if (error) throw new Error(SERVER_NOT_READY)
  save({ hour, endpoint: sub.endpoint, memberId })
}

export async function disableReminders() {
  const was = saved
  save(null)
  if (was) await syncClient()?.from('push_subscriptions').delete().eq('endpoint', was.endpoint)
  const reg = await navigator.serviceWorker.getRegistration()
  await (await reg?.pushManager.getSubscription())?.unsubscribe()
}

/** Keeps the server's copy right when the time or the person using this phone changes. */
export async function updateReminder(patch: { hour?: number; memberId?: string }) {
  if (!saved) return
  const next = { ...saved, ...patch }
  if (next.hour === saved.hour && next.memberId === saved.memberId) return
  save(next)
  await syncClient()
    ?.from('push_subscriptions')
    .update({ hour: next.hour, member_id: next.memberId, last_sent: null })
    .eq('endpoint', next.endpoint)
}

/** Asks the server to send this phone a notification straight away. */
export async function sendTestReminder() {
  if (!saved) return
  const { error } = await syncClient()!.functions.invoke('reminders', { body: { test: saved.endpoint } })
  if (error) throw new Error('The test could not be sent. Try again in a moment.')
}
