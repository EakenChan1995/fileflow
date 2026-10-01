import { ChangeEvent, ReactNode, useId } from 'react'

export function Card({
  title,
  hint,
  extra,
  footer,
  children
}: {
  title?: string
  hint?: string
  extra?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card">
      {title && (
        <header className="card-head">
          <h2>{title}</h2>
          {hint && <span className="hint">{hint}</span>}
          <div className="spacer" />
          {extra}
        </header>
      )}
      <div className="card-body">{children}</div>
      {footer}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      className={mono ? 'mono' : undefined}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  )
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={e => {
        const n = Number(e.target.value)
        onChange(Number.isFinite(n) ? n : 0)
      }}
    />
  )
}

export function Select<T extends string | number>({
  value,
  onChange,
  options
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as unknown as T)}>
      {options.map(o => (
        <option key={String(o.value)} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Checkbox({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
}) {
  const id = useId()
  return (
    <span className="check">
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </span>
  )
}

export function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
}) {
  return (
    <span className="check">
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span />
      </span>
      {label && <span>{label}</span>}
    </span>
  )
}

export function PathPicker({
  value,
  onChange,
  mode = 'dir',
  filters,
  placeholder = '未选择'
}: {
  value: string
  onChange: (v: string) => void
  mode?: 'dir' | 'files'
  filters?: { name: string; extensions: string[] }[]
  placeholder?: string
}) {
  const pick = async () => {
    if (mode === 'dir') {
      const dir = await window.api.dialog.pickDirectory({ title: '选择目录' })
      if (dir) onChange(dir)
    } else {
      const files = await window.api.dialog.pickFiles({ title: '选择文件', filters })
      if (files.length) onChange(files[0])
    }
  }
  return (
    <div className="path-input">
      <div className="value" title={value}>
        {value || placeholder}
      </div>
      <button className="btn sm" onClick={pick}>
        浏览…
      </button>
      {value && (
        <button className="btn sm ghost" onClick={() => onChange('')}>
          清除
        </button>
      )}
    </div>
  )
}

export function Badge({
  children,
  kind = 'default'
}: {
  children: ReactNode
  kind?: 'default' | 'ok' | 'warn' | 'err' | 'info'
}) {
  return <span className={`badge ${kind === 'default' ? '' : kind}`}>{children}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Note({ children, kind }: { children: ReactNode; kind?: 'warn' | 'danger' }) {
  return <div className={`note ${kind ?? ''}`}>{children}</div>
}
