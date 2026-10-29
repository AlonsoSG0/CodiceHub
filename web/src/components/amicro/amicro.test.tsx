import { cleanup, render, screen } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { motion as aliasedMotion } from "framer-motion"
import { motion as directMotion } from "motion/react"
import { FadeIn } from "./fade-in"
import { TiltCard } from "./tilt-card"

const originalRequestAnimationFrame = globalThis.requestAnimationFrame
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame

beforeAll(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16),
  )
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle))
})

afterEach(cleanup)

afterAll(() => {
  vi.stubGlobal("requestAnimationFrame", originalRequestAnimationFrame)
  vi.stubGlobal("cancelAnimationFrame", originalCancelAnimationFrame)
  vi.unstubAllGlobals()
})

describe("Amicro", () => {
  it("resolves the framer-motion alias to the same motion runtime", () => {
    expect(aliasedMotion).toBeDefined()
    expect(aliasedMotion).toBe(directMotion)
  })

  it("renders FadeIn content visibly", async () => {
    render(<FadeIn duration={0}>Faded content</FadeIn>)

    expect(await screen.findByText("Faded content")).toBeVisible()
  })

  it("renders TiltCard children", () => {
    render(<TiltCard>Tilt content</TiltCard>)

    expect(screen.getByText("Tilt content")).toBeInTheDocument()
  })
})
