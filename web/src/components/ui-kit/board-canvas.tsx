import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";
import type { Excalidraw as ExcalidrawComponent } from "@excalidraw/excalidraw";

type ExcalidrawProps = ComponentProps<typeof ExcalidrawComponent>;

/**
 * Excalidraw and its stylesheet load together, inside the lazy boundary.
 *
 * Both imports have to live in here. A module-level import of the package or of
 * its stylesheet is a side effect that keeps this module, the Excalidraw chunk
 * and its whole Mermaid dependency in the build even when no board is ever
 * rendered, and it also pulled Excalidraw's stylesheet into the production CSS.
 * The `@__PURE__` annotation makes the boundary droppable in exactly that case,
 * so importing another wrapper from `ui-kit` never drags Excalidraw along.
 */
const Excalidraw = /* @__PURE__ */ lazy(async () => {
  await import("@excalidraw/excalidraw/index.css");
  const { Excalidraw: Component } = await import("@excalidraw/excalidraw");
  return { default: Component };
});

export interface BoardCanvasProps {
  fallback?: ReactNode;
  className?: string;
  initialData?: ExcalidrawProps["initialData"];
  onChange?: ExcalidrawProps["onChange"];
}

export function BoardCanvas({ fallback = <p>Loading board…</p>, className, initialData, onChange }: BoardCanvasProps) {
  return (
    <section className={className} aria-label="Drawing board">
      <Suspense fallback={fallback}>
        <Excalidraw initialData={initialData} onChange={onChange} />
      </Suspense>
    </section>
  );
}
