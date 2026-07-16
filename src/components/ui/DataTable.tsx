type DataTableProps = {
  children: React.ReactNode;
  className?: string;
};

export function DataTable({ children, className = "" }: DataTableProps) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-border ${className}`}>
      <table className="min-w-full divide-y divide-border text-sm">
        {children}
      </table>
    </div>
  );
}

export function DataTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-surface-raised">
      <tr>{children}</tr>
    </thead>
  );
}

export function DataTableHeaderCell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th
      scope="col"
      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted"
    >
      {children}
    </th>
  );
}

export function DataTableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border bg-surface">{children}</tbody>;
}

export function DataTableRow({ children }: { children: React.ReactNode }) {
  return <tr className="align-top">{children}</tr>;
}

export function DataTableCell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-4 py-4 text-foreground ${className}`}>{children}</td>
  );
}
