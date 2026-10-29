import { useCallback, useState } from "react"

// Controlled/uncontrolled value semantics deliberately match Radix. Unlike Radix, this hook
// calls onChange synchronously in the setter and recreates setValue when its inputs change.
type UseControllableStateOptions<T> = {
  defaultProp: T
  prop?: T
  onChange?: (value: T) => void
}

export function useControllableState<T>({
  defaultProp,
  prop,
  onChange,
}: UseControllableStateOptions<T>): [T, (value: T | ((previous: T) => T)) => void] {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultProp)
  const value = prop === undefined ? uncontrolledValue : prop

  const setValue = useCallback(
    (nextValue: T | ((previous: T) => T)) => {
      const resolvedValue =
        typeof nextValue === "function"
          ? (nextValue as (previous: T) => T)(value)
          : nextValue

      if (Object.is(value, resolvedValue)) return
      if (prop === undefined) setUncontrolledValue(resolvedValue)
      onChange?.(resolvedValue)
    },
    [onChange, prop, value]
  )

  return [value, setValue]
}
