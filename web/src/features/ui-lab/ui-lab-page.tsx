import { Suspense, useState, type ReactNode } from "react";
import { MDXProvider } from "@mdx-js/react";
import { Callout } from "@/components/mdxcn/callout";
import { FadeIn } from "@/components/amicro/fade-in";
import {
  CodeBlock,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockItem,
  type BundledLanguage,
} from "@/components/kibo-ui/code-block";
import {
  MiniCalendar,
  MiniCalendarDay,
  MiniCalendarDays,
  MiniCalendarNavigation,
} from "@/components/kibo-ui/mini-calendar";
import { Marquee } from "@/components/magicui/marquee";
import { InView } from "@/components/motion-primitives/in-view";
import {
  BoardCanvas,
  DataTable,
  MiniChart,
  SortableList,
  type DataTableColumn,
} from "@/components/ui-kit";
import { mdxComponents } from "@/mdx/mdx-components";
import MdxFixture from "@/mdx/fixture.mdx";

interface FocusRecord {
  person: string;
  minutes: number;
}

const tableColumns: DataTableColumn<FocusRecord>[] = [
  { accessorKey: "person", header: "Person" },
  { accessorKey: "minutes", header: "Focus minutes" },
];

const tableData: FocusRecord[] = [{ person: "Ada Lovelace", minutes: 42 }];
const chartData = [
  { label: "Mon", value: 35 },
  { label: "Tue", value: 50 },
  { label: "Wed", value: 42 },
];
const initialTasks = ["Draft roadmap", "Review notes"];
const codeSamples: { language: BundledLanguage; filename: string; code: string }[] = [
  { language: "typescript", filename: "answer.ts", code: "const answer = 42" },
];

function LabSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-3 rounded-lg border border-border p-4">
      <h2 id={id} className="m-0 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function UiLabPage() {
  const [tasks, setTasks] = useState(initialTasks);

  return (
    <div className="page-column">
      <h1 className="page-title">UI Lab</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Small, local examples of the UI projects available to feature screens.
      </p>

      <div className="grid gap-6">
        <LabSection id="tanstack-table-heading" title="TanStack Table">
          <DataTable columns={tableColumns} data={tableData} />
        </LabSection>

        <LabSection id="tanstack-charts-heading" title="TanStack Charts">
          <MiniChart data={chartData} label="Weekly focus minutes" height={160} />
        </LabSection>

        <LabSection id="dnd-kit-heading" title="dnd kit React">
          <SortableList
            items={tasks}
            getItemId={(task) => task}
            renderItem={(task) => task}
            label="Sample tasks"
            onItemsChange={(nextTasks) => setTasks(nextTasks)}
          />
        </LabSection>

        <LabSection id="excalidraw-heading" title="Excalidraw">
          <Suspense fallback={<p role="status">Loading Excalidraw board…</p>}>
            <BoardCanvas fallback={<p role="status">Loading Excalidraw board…</p>} />
          </Suspense>
        </LabSection>

        <LabSection id="magic-ui-heading" title="Magic UI">
          <Marquee repeat={1} pauseOnHover aria-label="Magic UI marquee">
            <span>Small steps, steady progress</span>
          </Marquee>
        </LabSection>

        <LabSection id="motion-primitives-heading" title="Motion Primitives">
          <InView as="div" once transition={{ duration: 0.2 }}>
            Motion primitive sample
          </InView>
        </LabSection>

        <LabSection id="kibo-ui-heading" title="Kibo UI">
          <CodeBlock data={codeSamples} defaultValue="typescript" aria-label="TypeScript example">
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

          <MiniCalendar days={5} className="w-fit">
            <MiniCalendarNavigation direction="prev" aria-label="Previous days" />
            <MiniCalendarDays>
              {(date) => <MiniCalendarDay key={date.getTime()} date={date} />}
            </MiniCalendarDays>
            <MiniCalendarNavigation direction="next" aria-label="Next days" />
          </MiniCalendar>
        </LabSection>

        <LabSection id="amicro-heading" title="Amicro">
          <FadeIn duration={0.2}>Amicro animation sample</FadeIn>
        </LabSection>

        <LabSection id="mdxcn-heading" title="MDXCN">
          <Callout type="tip">MDXCN callout sample</Callout>
          <MDXProvider components={mdxComponents}>
            <MdxFixture />
          </MDXProvider>
        </LabSection>
      </div>
    </div>
  );
}
