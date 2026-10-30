import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff } from "lucide-react"
import { sections } from "@/app/sections"
import { LanguageToggle } from "@/components/layout/language-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogBackdrop, DialogBody, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPopup, DialogPortal, DialogTitle } from "@/components/ui/dialog"
import { createBackup, fetchBackups, restoreBackup, type Backup } from "@/lib/api"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useT } from "@/i18n"
import { preferences, usePreference } from "./preferences"
import { TimezoneSelect } from "./timezone-select"

type Setting = (typeof preferences)[number]

function translated(t: (key: string) => string, key: string, fallback: string) {
  const value = t(key)
  return value === key ? fallback : value
}

function sectionLabel(id: string, label: string, t: (key: string) => string) {
  return translated(t, `settings.module.${id}`, label)
}

function SettingsControl({ setting }: { setting: Setting }) {
  const { t } = useT()
  const [value, setValue] = usePreference(setting.key)

  if (setting.kind === "modules") {
    return <ModulesControl />
  }

  if (setting.kind === "timezone") {
    return <TimezoneSelect value={typeof value === "string" ? value : String(setting.default)} onChange={setValue} />
  }

  if (setting.kind === "toggle") {
    const checked = value === true
    return (
      <button
        type="button"
        role="switch"
        aria-label={translated(t, `settings.preference.${setting.key}.label`, setting.label)}
        aria-checked={checked}
        onClick={() => setValue(!checked)}
        className="group/switch relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-checked:bg-primary"
      >
        <span className="pointer-events-none inline-block size-4 translate-x-1 rounded-full bg-background shadow-sm transition-transform group-aria-checked/switch:translate-x-5" aria-hidden="true" />
      </button>
    )
  }

  if ((setting.kind === "select" || setting.kind === "options") && setting.options) {
    const selectedValue = typeof value === "string" ? value : String(setting.default)
    return (
      <Select value={selectedValue} onValueChange={(nextValue) => { if (nextValue !== null) setValue(nextValue) }}>
        <SelectTrigger aria-label={translated(t, `settings.preference.${setting.key}.label`, setting.label)} className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {setting.options.map((option) => (
            <SelectItem key={String(option)} value={String(option)}>{translated(t, `settings.option.${setting.key}.${String(option)}`, String(option))}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <Input
      aria-label={translated(t, `settings.preference.${setting.key}.label`, setting.label)}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => setValue(event.currentTarget.value)}
      className="w-full sm:max-w-60"
    />
  )
}

function ModulesControl() {
  const { t } = useT()
  const [value, setValue] = usePreference("nav.modules")
  const modules = value && typeof value === "object" && !Array.isArray(value)
    ? value as { order: string[]; hidden: string[] }
    : { order: sections.map(({ id }) => id), hidden: [] }
  const orderedIds = modules.order
  const displayedSections = [
    ...orderedIds.flatMap((id) => {
      const section = sections.find((candidate) => candidate.id === id)
      return section ? [section] : []
    }),
    ...sections.filter(({ id }) => !orderedIds.includes(id)),
  ]

  function move(id: string, offset: -1 | 1) {
    const index = orderedIds.indexOf(id)
    const target = index + offset
    if (index < 0 || target < 0 || target >= orderedIds.length) return
    const next = [...orderedIds]
    ;[next[index], next[target]] = [next[target], next[index]]
    setValue({ ...modules, order: next })
  }

  function toggle(id: string) {
    const hidden = modules.hidden.includes(id)
      ? modules.hidden.filter((item) => item !== id)
      : [...modules.hidden, id]
    const order = modules.order.includes(id) ? modules.order : [...modules.order, id]
    setValue({ order, hidden })
  }

  return (
    <ul aria-label={t("settings.modules.visible")} className="w-full divide-y divide-border sm:max-w-72">
      {displayedSections.map((section) => {
        const index = orderedIds.indexOf(section.id)
        const visible = !modules.hidden.includes(section.id)
        return (
          <li key={section.id} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
            <span className="text-sm">{sectionLabel(section.id, section.label, t)}</span>
            <span className="flex items-center gap-1">
              {visible && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("settings.modules.moveUp", { section: sectionLabel(section.id, section.label, t) })}
                    disabled={index === 0}
                    onClick={() => move(section.id, -1)}
                  ><ArrowUp aria-hidden="true" /></Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("settings.modules.moveDown", { section: sectionLabel(section.id, section.label, t) })}
                    disabled={index === orderedIds.length - 1}
                    onClick={() => move(section.id, 1)}
                  ><ArrowDown aria-hidden="true" /></Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t(visible ? "settings.modules.hide" : "settings.modules.show", { section: sectionLabel(section.id, section.label, t) })}
                aria-pressed={visible}
                onClick={() => toggle(section.id)}
              >
                {visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                {visible ? t("settings.modules.shown") : t("settings.modules.hidden")}
              </Button>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function SettingRow({ setting }: { setting: Setting }) {
  const { t } = useT()
  const label = translated(t, `settings.preference.${setting.key}.label`, setting.label)
  const description = translated(t, `settings.preference.${setting.key}.description`, setting.description)
  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <h3 className="text-sm font-medium">{label}</h3>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="sm:justify-self-end">
        <SettingsControl setting={setting} />
      </div>
    </div>
  )
}

function BackupsSection() {
  const { t } = useT()
  const [backups, setBackups] = useState<Backup[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    fetchBackups().then((items) => { if (active) setBackups(items) }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [])

  async function create() {
    setBusy(true); setError(false)
    try { await createBackup(); setBackups(await fetchBackups()) }
    catch { setError(true) }
    finally { setBusy(false) }
  }
  async function restore() {
    if (!selected) return
    setBusy(true); setError(false)
    try { await restoreBackup(selected); window.location.reload() }
    catch { setError(true); setSelected(null) }
    finally { setBusy(false) }
  }
  function size(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return (
    <section aria-labelledby="settings-backups" className="py-5">
      <h2 id="settings-backups" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("settings.backups.title")}</h2>
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <p className="text-sm text-muted-foreground">{t("settings.backups.description")}</p>
        <Button type="button" disabled={busy} onClick={create}>{t(busy ? "settings.backups.busy" : "settings.backups.create")}</Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{t("settings.backups.error")}</p>}
      {backups.length === 0 ? <p className="text-sm text-muted-foreground">{t("settings.backups.empty")}</p> : (
        <ul className="divide-y divide-border/70">{backups.map((backup) => (
          <li key={backup.name} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="break-all text-sm">{backup.name}</p><p className="text-xs text-muted-foreground">{new Date(backup.createdAt).toLocaleString()} · {size(backup.bytes)}</p></div>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setSelected(backup.name)}>{t("settings.backups.restore")}</Button>
          </li>
        ))}</ul>
      )}
      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open && !busy) setSelected(null) }}>
        <DialogPortal><DialogBackdrop /><DialogPopup>
          <DialogHeader><DialogTitle>{t("settings.backups.confirmTitle")}</DialogTitle></DialogHeader>
          <DialogBody><DialogDescription>{t("settings.backups.confirmDescription")}</DialogDescription></DialogBody>
          <DialogFooter><DialogClose render={<Button variant="outline" disabled={busy} />}>{t("settings.backups.cancel")}</DialogClose><Button type="button" disabled={busy} onClick={restore}>{t("settings.backups.confirm")}</Button></DialogFooter>
        </DialogPopup></DialogPortal>
      </Dialog>
    </section>
  )
}

export function SettingsPage() {
  const { t } = useT()
  const groups = [...new Set(preferences.map(({ group }) => group))]

  return (
    <main className="min-h-dvh bg-background px-4 py-6 text-foreground sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t("settings.backHome")}
        </Link>
        <header className="flex items-start justify-between gap-4 pb-6 pt-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("settings.subtitle")}</p>
          </div>
          <LanguageToggle />
        </header>
        <div className="flex items-center justify-center gap-2.5 pb-7 pt-1">
          <img src="/brand/CodiceHub_Isotipo.png" alt="" aria-hidden="true" className="size-9" />
          <span className="text-lg font-semibold tracking-tight text-foreground">CodiceHub</span>
          <span aria-hidden="true" className="text-muted-foreground/60">·</span>
          <span className="text-sm text-muted-foreground" data-app-version>{__APP_VERSION__}</span>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {groups.map((group) => (
            <section key={group} aria-labelledby={`settings-${group.toLowerCase()}`} className="py-5">
              <h2 id={`settings-${group.toLowerCase()}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`settings.group.${group.toLowerCase()}`)}</h2>
              <div className="divide-y divide-border/70">
                {preferences.filter((setting) => setting.group === group).map((setting) => (
                  <SettingRow key={setting.key} setting={setting} />
                ))}
              </div>
            </section>
          ))}
          <BackupsSection />
        </div>
      </div>
    </main>
  )
}
