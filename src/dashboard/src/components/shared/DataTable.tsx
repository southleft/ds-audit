import React, { useMemo, useState } from 'react';
import { Table, Pagination, Group, Text, ActionIcon, Box } from '@mantine/core';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  width?: string | number;
  render?: (row: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pageSize?: number;
  emptyMessage?: string;
  /** When provided, rows get a chevron that expands to this content. */
  expandedContent?: (row: T, index: number) => React.ReactNode;
}

/**
 * Single paginated table used across all views (replaces the former
 * PaginatedTable/ExpandableTable near-duplicates). Rows can optionally
 * expand to show detail content.
 */
export function DataTable<T>({
  columns,
  data,
  pageSize = 10,
  emptyMessage = 'No data available',
  expandedContent,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, safePage, pageSize]);

  if (data.length === 0) {
    return (
      <Text size="sm" c="dimmed" py="sm">
        {emptyMessage}
      </Text>
    );
  }

  const toggle = (globalIndex: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(globalIndex)) {
        next.delete(globalIndex);
      } else {
        next.add(globalIndex);
      }
      return next;
    });
  };

  const columnCount = columns.length + (expandedContent ? 1 : 0);

  return (
    <Box>
      <Table.ScrollContainer minWidth={480}>
        <Table striped highlightOnHover withTableBorder verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              {expandedContent && <Table.Th w={36} />}
              {columns.map(col => (
                <Table.Th key={col.key} w={col.width}>
                  {col.header}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pageRows.map((row, i) => {
              const globalIndex = (safePage - 1) * pageSize + i;
              const isOpen = expanded.has(globalIndex);
              return (
                <React.Fragment key={globalIndex}>
                  <Table.Tr>
                    {expandedContent && (
                      <Table.Td>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          onClick={() => toggle(globalIndex)}
                          aria-label={isOpen ? 'Collapse row' : 'Expand row'}
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </ActionIcon>
                      </Table.Td>
                    )}
                    {columns.map(col => (
                      <Table.Td key={col.key}>
                        {col.render
                          ? col.render(row, globalIndex)
                          : String((row as Record<string, unknown>)[col.key] ?? '')}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                  {expandedContent && isOpen && (
                    <Table.Tr>
                      <Table.Td colSpan={columnCount} p="sm">
                        {expandedContent(row, globalIndex)}
                      </Table.Td>
                    </Table.Tr>
                  )}
                </React.Fragment>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {totalPages > 1 && (
        <Group justify="space-between" mt="xs">
          <Text size="xs" c="dimmed">
            {data.length} rows
          </Text>
          <Pagination value={safePage} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      )}
    </Box>
  );
}
