import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  className?: string;
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" };
  footer?: ReactNode;
  pageSize?: number;
}

export function DataTable<T>({ rows, columns, rowKey, onRowClick, empty, initialSort, footer, pageSize = 25 }: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [limit, setLimit] = useState(pageSize);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a), vb = col.sortValue!(b);
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * dir;
    });
  }, [rows, columns, sort]);

  if (!rows.length) return <>{empty}</>;
  const align = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  const visible = sorted.slice(0, limit);
  const more = sorted.length > limit && (
    <div className="flex justify-center px-5 pt-4">
      <button className="btn-ghost text-xs" onClick={() => setLimit((l) => l + pageSize)}>Show {Math.min(pageSize, sorted.length - limit)} more of {sorted.length - limit}</button>
    </div>
  );
  // Phones: each row becomes a card (first column as the title, the rest as label/value pairs).
  const [head, ...rest] = columns;
  const mobile = (
    <div className="md:hidden">
      <ul className="space-y-2">
        {visible.map((r) => (
          <li key={rowKey(r)}>
            <div role={onRowClick ? "button" : undefined} tabIndex={onRowClick ? 0 : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(r) : undefined}
              className={`glass-soft block w-full p-3 text-left text-sm ${onRowClick ? "cursor-pointer active:bg-white/[0.1]" : ""}`}>
              <div className="num mb-2 font-medium">{head.render(r)}</div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                {rest.filter((c) => c.header).map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="label text-[10px]">{c.header}</dt>
                    <dd className="num mt-0.5 truncate">{c.render(r)}</dd>
                  </div>
                ))}
              </dl>
              {rest.filter((c) => !c.header).map((c) => <div key={c.key} className="mt-2 flex justify-end">{c.render(r)}</div>)}
            </div>
          </li>
        ))}
      </ul>
      {more}
    </div>
  );
  return (
    <>
    {mobile}
    <div className="-mx-5 hidden overflow-x-auto md:block">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} scope="col" className={`label whitespace-nowrap px-5 py-3 font-semibold ${align(c.align)} ${c.hideOnMobile ? "hidden md:table-cell" : ""}`}>
                  {c.sortValue ? (
                    <button className={`inline-flex items-center gap-1 hover:text-white ${active ? "text-white" : ""}`}
                      onClick={() => setSort({ key: c.key, dir: active && sort?.dir === "desc" ? "asc" : "desc" })}>
                      {c.header}
                      {active ? (sort?.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ChevronsUpDown size={12} className="opacity-40" />}
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={`border-b border-white/[0.06] transition-colors last:border-0 hover:bg-white/[0.05] ${onRowClick ? "cursor-pointer" : ""}`}>
              {columns.map((c) => (
                <td key={c.key} className={`num px-5 py-3 align-middle ${align(c.align)} ${c.className ?? ""} ${c.hideOnMobile ? "hidden md:table-cell" : ""}`}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot className="border-t border-white/15">{footer}</tfoot>}
      </table>
      {more}
    </div>
    </>
  );
}
