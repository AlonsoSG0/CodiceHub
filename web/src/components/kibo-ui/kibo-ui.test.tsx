import { readFileSync } from "node:fs"
import type { ComponentType } from "react"
import { act, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { BundledLanguage } from "./code-block/index"
import { useControllableState } from "./use-controllable-state"
import {
  CodeBlock,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockFiles,
  CodeBlockItem,
} from "./code-block/index"

const data: { language: BundledLanguage; filename: string; code: string }[] = [
  { language: "typescript", filename: "example.ts", code: "const answer = 42" },
]

function renderFilename(icon?: ComponentType<{ className?: string }>) {
  return render(
    <CodeBlock data={data} defaultValue="typescript">
      <CodeBlockFiles>
        {(item) => (
          <CodeBlockFilename key={item.language} value={item.language} icon={icon}>
            {item.filename}
          </CodeBlockFilename>
        )}
      </CodeBlockFiles>
    </CodeBlock>
  )
}

describe("Kibo UI controllable state", () => {
  it("uses a controlled prop instead of internal state", () => {
    const { result } = renderHook(() => useControllableState({ defaultProp: "initial", prop: "controlled" }))

    expect(result.current[0]).toBe("controlled")
  })

  it("uses internal state when no controlled prop is given", () => {
    const { result } = renderHook(() => useControllableState({ defaultProp: "initial" }))

    act(() => result.current[1]("updated"))

    expect(result.current[0]).toBe("updated")
  })

  it("resolves a functional updater against the current value", () => {
    const { result } = renderHook(() => useControllableState({ defaultProp: 2 }))

    act(() => result.current[1]((current) => current + 3))

    expect(result.current[0]).toBe(5)
  })

  it("returns its internal state after a controlled-to-uncontrolled transition", () => {
    type Props = { prop: string | undefined }
    const { result, rerender } = renderHook(
      ({ prop }: Props) => useControllableState({ defaultProp: "internal", prop }),
      { initialProps: { prop: "controlled" as string | undefined } },
    )

    expect(result.current[0]).toBe("controlled")
    rerender({ prop: undefined })

    expect(result.current[0]).toBe("internal")
  })
})

describe("Kibo UI code block", () => {
  it("renders code text and a copy control", () => {
    render(
      <CodeBlock data={data} defaultValue="typescript">
        <CodeBlockCopyButton aria-label="Copy code" />
        <CodeBlockBody>
          {(item) => (
            <CodeBlockItem key={item.language} value={item.language}>
              <CodeBlockContent language={item.language as BundledLanguage} syntaxHighlighting={false}>
                {item.code}
              </CodeBlockContent>
            </CodeBlockItem>
          )}
        </CodeBlockBody>
      </CodeBlock>
    )

    expect(screen.getByText("const answer = 42")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument()
  })

  it("renders the default lucide filename icon", () => {
    const { container } = renderFilename()

    expect(screen.getByText("example.ts")).toBeInTheDocument()
    expect(container.querySelector("svg.lucide")).toBeInTheDocument()
  })

  it("lets an explicit filename icon override the default", () => {
    function CustomIcon({ className }: { className?: string }) {
      return <svg aria-label="Custom filename icon" className={className} />
    }

    const { container } = renderFilename(CustomIcon)

    expect(screen.getByLabelText("Custom filename icon")).toBeInTheDocument()
    expect(container.querySelector("svg.lucide")).not.toBeInTheDocument()
  })

  it("does not import react-icons in the vendored source", () => {
    const source = readFileSync("src/components/kibo-ui/code-block/index.tsx", "utf8")

    expect(source).not.toMatch(/from\s+["']react-icons(?:\/[^"']*)?["']/)
  })
})
