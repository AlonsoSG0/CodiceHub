import { useEffect, useState, type ComponentPropsWithoutRef } from "react"
import { useT } from "@/i18n"

export type ClockProps = Omit<ComponentPropsWithoutRef<"time">, "children" | "dateTime">

export function Clock({ className, ...props }: ClockProps) {
  const { locale } = useT()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now)

  return (
    <time
      className={`font-mono tabular-nums tracking-tight ${className ?? ""}`}
      dateTime={now.toISOString()}
      {...props}
    >
      {time}
    </time>
  )
}
