import React, { useState, useEffect } from 'react';
import { Card, Table, Group, Select, Pagination, Text, Badge, TextInput } from '@mantine/core';

interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (value: any, row: any) => React.ReactNode;
}

interface PaginatedTableProps {
  data: any[];
  columns: TableColumn[];
  title?: string;
  subtitle?: string;
  filters?: {
    key: string;
    label: string;
    options: { value: string; label: string }[];
  }[];
  searchable?: boolean;
  searchPlaceholder?: string;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
  className?: string;
}

const PaginatedTable: React.FC<PaginatedTableProps> = ({
  data,
  columns,
  title,
  subtitle,
  filters = [],
  searchable = false,
  searchPlaceholder = "Search...",
  defaultPageSize = 15,
  pageSizeOptions = [10, 15, 25, 50, 100],
  className = ""
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Initialize filter values
  useEffect(() => {
    const initialFilters: Record<string, string> = {};
    filters.forEach(filter => {
      initialFilters[filter.key] = 'all';
    });
    setFilterValues(initialFilters);
  }, [filters]);

  // Filter and search data
  const filteredData = data.filter(row => {
    // Apply filters
    const filterMatch = filters.every(filter => {
      const filterValue = filterValues[filter.key];
      return filterValue === 'all' || row[filter.key] === filterValue;
    });

    // Apply search
    const searchMatch = !searchable || !searchTerm ||
      columns.some(col => {
        const value = row[col.key];
        return value && value.toString().toLowerCase().includes(searchTerm.toLowerCase());
      });

    return filterMatch && searchMatch;
  });

  // Sort data
  const sortedData = sortColumn ?
    [...filteredData].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    }) : filteredData;

  // Paginate data
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = sortedData.slice(startIndex, startIndex + pageSize);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterValues, searchTerm, pageSize]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <Card className={`paginated-table-container ${className}`} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
      {(title || subtitle || filters.length > 0 || searchable) && (
        <div className="table-header" style={{ marginBottom: '1rem' }}>
          {(title || subtitle) && (
            <div>
              {title && <Text size="lg" fw={600}>{title}</Text>}
              {subtitle && <Text size="sm" c="dimmed">{subtitle}</Text>}
            </div>
          )}

          <Group justify="space-between" wrap="wrap" style={{ alignItems: 'end' }}>
            <Group style={{ alignItems: 'end' }}>
              {searchable && (
                <TextInput
                  placeholder={searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.currentTarget.value)}
                  style={{ width: 250 }}
                />
              )}
              {filters.map(filter => (
                <Select
                  key={filter.key}
                  label={filter.label}
                  value={filterValues[filter.key] || 'all'}
                  onChange={(value) => setFilterValues(prev => ({ ...prev, [filter.key]: value || 'all' }))}
                  data={[{ value: 'all', label: `All ${filter.label}` }, ...filter.options]}
                  style={{ width: 150 }}
                />
              ))}
            </Group>

            <Group>
              <Text size="sm" c="dimmed">
                Showing {Math.min(paginatedData.length, pageSize)} of {sortedData.length} items
              </Text>
              <Group gap="xs">
                <Text size="sm" c="dimmed">Rows per page:</Text>
                <Select
                  value={pageSize.toString()}
                  onChange={(value) => setPageSize(parseInt(value || defaultPageSize.toString()))}
                  data={pageSizeOptions.map(size => ({ value: size.toString(), label: size.toString() }))}
                  style={{ width: 80 }}
                />
              </Group>
            </Group>
          </Group>
        </div>
      )}

      {paginatedData.length > 0 ? (
        <>
          <Table highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                {columns.map(column => (
                  <Table.Th
                    key={column.key}
                    style={{
                      width: column.width,
                      cursor: column.sortable ? 'pointer' : 'default',
                      userSelect: 'none'
                    }}
                    onClick={column.sortable ? () => handleSort(column.key) : undefined}
                  >
                    {column.label}{column.sortable && getSortIcon(column.key)}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paginatedData.map((row, idx) => (
                <Table.Tr key={idx}>
                  {columns.map(column => (
                    <Table.Td key={column.key}>
                      {column.render ? column.render(row[column.key], row) : row[column.key]}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          {totalPages > 1 && (
            <Group justify="space-between" mt="lg">
              <Text size="sm" c="dimmed">
                Page {currentPage} of {totalPages} ({sortedData.length} total items)
              </Text>
              <Pagination
                total={totalPages}
                value={currentPage}
                onChange={setCurrentPage}
              />
            </Group>
          )}
        </>
      ) : (
        <Text size="lg" c="dimmed" ta="center" py="xl">
          No items match the selected filters
        </Text>
      )}
    </Card>
  );
};

export default PaginatedTable;
