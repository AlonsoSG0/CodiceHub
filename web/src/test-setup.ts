// Registers the `@testing-library/jest-dom` matchers for every test file.
//
// `tsconfig.json` already lists `@testing-library/jest-dom` in `types`, so the
// type system has always promised matchers such as `toBeInTheDocument` and
// `toBeVisible` while no test file registered them at runtime. Registering them
// here once makes that promise true for every suite instead of leaving each new
// test file to discover the gap with an "Invalid Chai property" failure.
import "@testing-library/jest-dom/vitest";
