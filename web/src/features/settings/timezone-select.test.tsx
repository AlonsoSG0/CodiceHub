import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TimezoneSelect } from "./timezone-select"

afterEach(cleanup)

describe("TimezoneSelect", () => {
  it("filters zones by city using accent-insensitive search", async () => {
    render(<TimezoneSelect value="America/Mexico_City" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: /time zone/i }))
    fireEvent.change(screen.getByRole("textbox", { name: "Search time zones" }), { target: { value: "México City" } })

    expect(await screen.findByRole("menuitemradio", { name: /Mexico City/ })).toBeInTheDocument()
    expect(screen.queryByRole("menuitemradio", { name: /New York/ })).not.toBeInTheDocument()
  })

  it("saves the selected IANA id", async () => {
    const onChange = vi.fn()
    render(<TimezoneSelect value="America/Mexico_City" onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /time zone/i }))
    fireEvent.change(screen.getByRole("textbox", { name: "Search time zones" }), { target: { value: "new york" } })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /New York/ }))

    expect(onChange).toHaveBeenCalledWith("America/New_York")
  })

  it("lists Mexico before unrelated zones", async () => {
    render(<TimezoneSelect value="America/Mexico_City" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: /time zone/i }))

    const options = await screen.findAllByRole("menuitemradio")
    const names = options.map((option) => option.getAttribute("aria-label") ?? option.textContent ?? "")
    expect(names[0]).toContain("Mexico City")
    expect(names.findIndex((name) => name.includes("Abidjan"))).toBeGreaterThan(0)
  })
})
