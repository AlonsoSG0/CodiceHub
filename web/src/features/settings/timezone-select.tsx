import { useState } from "react"
import { Menu as BaseMenu } from "@base-ui/react/menu"
import { Check, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MenuPopup, menuItemClassName } from "@/components/ui/menu"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n"
import { detectTimeZone, zoneGroups, zoneLabel } from "@/lib/timezone"

type TimezoneSelectProps = {
  value: string
  onChange: (timeZone: string) => void
}

export function TimezoneSelect({ value, onChange }: TimezoneSelectProps) {
  const [query, setQuery] = useState("")
  const { t } = useT()
  const detectedZone = detectTimeZone()
  const groups = zoneGroups(query)

  return (
    <div className="w-full space-y-2 sm:w-72">
      <BaseMenu.Root onOpenChange={(open) => { if (!open) setQuery("") }}>
        <BaseMenu.Trigger
          render={
            <Button
              type="button"
              variant="outline"
              aria-label={t("settings.timezone.selected", { zone: zoneLabel(value) })}
              className="w-full justify-between font-normal"
            />
          }
        >
          <span className="truncate">{zoneLabel(value)}</span>
          <ChevronDown aria-hidden="true" className="text-muted-foreground" />
        </BaseMenu.Trigger>
        <MenuPopup className="w-[min(20rem,calc(100vw-2rem))] p-2">
          <div className="border-b border-border p-1 pb-2">
            <Input
              aria-label={t("settings.timezone.searchLabel")}
              placeholder={t("settings.timezone.searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => event.stopPropagation()}
              className="h-9"
            />
          </div>
          <div aria-label={t("settings.timezone.listLabel")} className="max-h-72 overflow-y-auto py-1">
            {groups.map((group) => (
              <div key={group.label} role="group" aria-label={t(group.label === "Mexico and the US" ? "settings.timezone.group.mexicoUs" : "settings.timezone.group.everywhere")}>
                <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{t(group.label === "Mexico and the US" ? "settings.timezone.group.mexicoUs" : "settings.timezone.group.everywhere")}</p>
                {group.zones.map((timeZone) => {
                  const selected = value === timeZone
                  return (
                    <BaseMenu.Item
                      key={timeZone}
                      role="menuitemradio"
                      aria-label={selected ? t("settings.timezone.zoneSelected", { zone: zoneLabel(timeZone) }) : zoneLabel(timeZone)}
                      aria-checked={selected}
                      className={cn(menuItemClassName, "min-h-9")}
                      onClick={() => onChange(timeZone)}
                    >
                      <span className="truncate">{zoneLabel(timeZone)}</span>
                      {selected && <Check aria-hidden="true" className="ml-auto size-4 shrink-0" />}
                    </BaseMenu.Item>
                  )
                })}
              </div>
            ))}
            {groups.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">{t("settings.timezone.noMatch")}</p>}
          </div>
        </MenuPopup>
      </BaseMenu.Root>
      {value !== detectedZone && (
        <p className="text-xs leading-5 text-muted-foreground">
          {t("settings.timezone.deviceSuggestion", { zone: zoneLabel(detectedZone) })}{" "}
          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onChange(detectedZone)}>
            {t("settings.timezone.useDeviceZone")}
          </Button>
        </p>
      )}
    </div>
  )
}
