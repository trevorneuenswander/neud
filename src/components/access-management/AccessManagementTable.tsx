import type { ReactNode } from "react";
import {
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableHeaderCell,
} from "@/components/ui/DataTable";
import type { AccessManagementColumnWidths } from "@/lib/access-management/table-layout";

type AccessManagementTableProps = {
  columnWidths: AccessManagementColumnWidths;
  headers: ReactNode[];
  children: ReactNode;
};

export function AccessManagementTable({
  columnWidths,
  headers,
  children,
}: AccessManagementTableProps) {
  return (
    <DataTable tableClassName="table-fixed w-full">
      <colgroup>
        {columnWidths.map((width, index) => (
          <col key={`${width}-${index}`} style={{ width }} />
        ))}
      </colgroup>
      <DataTableHead>
        {headers.map((header, index) => (
          <DataTableHeaderCell key={index}>{header}</DataTableHeaderCell>
        ))}
      </DataTableHead>
      <DataTableBody>{children}</DataTableBody>
    </DataTable>
  );
}
