// @vitest-environment node

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const packages = [
  "@tanstack/react-table",
  "@tanstack/charts",
  "@dnd-kit/react",
  "@dnd-kit/core",
  "@dnd-kit/sortable",
  "@dnd-kit/utilities",
  "@excalidraw/excalidraw",
  "motion",
  "framer-motion",
  "tunnel-rat",
  "date-fns",
  "jotai",
]

describe("UI kit dependency licences", () => {
  it("declares the npm projects and animation packages with installed MIT licences", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      dependencies: Record<string, string>
    }
    const requireFromWeb = createRequire(resolve(process.cwd(), "package.json"))
    for (const packageName of packages) {
      expect(packageJson.dependencies[packageName], `${packageName} is declared`).toBeDefined()
      const resolveWithImportConditions = requireFromWeb.resolve as (
        specifier: string,
        options: { conditions: Set<string> },
      ) => string
      let directory = dirname(resolveWithImportConditions(packageName, { conditions: new Set(["import"]) }))
      let installedPackage: { name?: string; license?: string } | undefined

      while (directory !== dirname(directory)) {
        try {
          const candidate = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8")) as {
            name?: string
            license?: string
          }
          if (candidate.name === packageName) {
            installedPackage = candidate
            break
          }
        } catch {
          // Keep walking toward the resolved package's root.
        }
        directory = dirname(directory)
      }

      expect(installedPackage, `${packageName} resolves to an installed package`).toBeDefined()
      expect(installedPackage?.license, `${packageName} licence`).toBe("MIT")
    }
  })
})
