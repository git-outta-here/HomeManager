import type { CSSProperties, ReactNode } from 'react'
import type { Member } from './types'

export const ICONS = [
  '🧹', '🍽️', '🧺', '🗑️', '🚿', '🛏️', '🍳', '🛒', '🪴', '🐶',
  '🚗', '📦', '🧾', '🔧', '🧼', '🪟', '📬', '💊', '🎁', '📞', '✅',
]

export const tint = (m: Member | undefined) => ({ '--c': m?.color ?? 'var(--muted)' }) as CSSProperties

export function Avatar({ member, small }: { member: Member; small?: boolean }) {
  return (
    <span className={small ? 'avatar small' : 'avatar'} style={tint(member)} title={member.name}>
      {member.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="section">
      <h2>
        {title}
        {count !== undefined && <span className="count">{count}</span>}
      </h2>
      {children}
    </section>
  )
}

export function Empty({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <p>{children}</p>
    </div>
  )
}
