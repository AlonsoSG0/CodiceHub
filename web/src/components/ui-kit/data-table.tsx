import {
  columnVisibilityFeature,
  coreFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";

/**
 * v9 makes every capability opt-in through an explicit feature set. `coreFeatures`
 * supplies the table, column, row, header and cell core; `columnVisibilityFeature`
 * is added so rows expose `getVisibleCells()`, which is the v8 behaviour these
 * wrappers are expected to keep and the seam the later table screens will hide
 * columns through.
 */
const tableFeatures = { ...coreFeatures, columnVisibilityFeature };

/**
 * The column type a caller writes against, so the feature set stays an internal
 * detail of this wrapper instead of something every consumer has to restate.
 */
export type DataTableColumn<TData extends RowData> = ColumnDef<typeof tableFeatures, TData>;

export interface DataTableProps<TData extends RowData> {
  columns: DataTableColumn<TData>[];
  data: TData[];
}

/**
 * A headless table on TanStack Table v9's native API.
 *
 * v9 replaces the v8 `useReactTable` + `getCoreRowModel()` pair with `useTable`
 * and an explicit feature set, so `coreFeatures` is passed instead of a row
 * model factory. The package's `@tanstack/react-table/legacy` entry still
 * exposes the v8 surface, and it is deliberately not used here: these wrappers
 * are new code that the notes, habits, books and task board features will
 * build on, so they target the current API rather than a compatibility shim.
 */
export function DataTable<TData extends RowData>({ columns, data }: DataTableProps<TData>) {
  const table = useTable({ features: tableFeatures, columns, data });

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <th key={header.id} colSpan={header.colSpan}>
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>
                <table.FlexRender cell={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
