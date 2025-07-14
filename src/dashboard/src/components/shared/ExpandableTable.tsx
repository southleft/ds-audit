import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Table, 
  Group, 
  Select, 
  Pagination, 
  Text, 
  Badge, 
  TextInput,
  Collapse,
  Box,
  Stack,
  Divider,
  ActionIcon,
  Code,
  Paper,
  Title,
  List,
  ThemeIcon,
  Anchor
} from '@mantine/core';

interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (value: any, row: any) => React.ReactNode;
}

interface ExpandableTableProps {
  data: any[];
  columns: TableColumn[];
  expandedContent: (row: any) => React.ReactNode;
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
  rowKey?: string;
}

const ExpandableTable: React.FC<ExpandableTableProps> = ({
  data,
  columns,
  expandedContent,
  title,
  subtitle,
  filters = [],
  searchable = false,
  searchPlaceholder = "Search...",
  defaultPageSize = 15,
  pageSizeOptions = [10, 15, 25, 50, 100],
  className = "",
  rowKey = 'id'
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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

  const toggleRow = (rowId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
      } else {
        newSet.add(rowId);
      }
      return newSet;
    });
  };

  const isRowExpanded = (rowId: string) => expandedRows.has(rowId);

  return (
    <Card className={`expandable-table-container ${className}`} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
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
                <Table.Th style={{ width: '40px' }}></Table.Th>
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
              {paginatedData.map((row, idx) => {
                const rowId = row[rowKey] || idx.toString();
                const expanded = isRowExpanded(rowId);
                
                return (
                  <React.Fragment key={rowId}>
                    <Table.Tr 
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleRow(rowId)}
                    >
                      <Table.Td>
                        <Text size="sm" style={{ cursor: 'pointer', userSelect: 'none', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 200ms' }}>
                          ▶
                        </Text>
                      </Table.Td>
                      {columns.map(column => (
                        <Table.Td key={column.key}>
                          {column.render ? column.render(row[column.key], row) : row[column.key]}
                        </Table.Td>
                      ))}
                    </Table.Tr>
                    {expanded && (
                      <Table.Tr>
                        <Table.Td colSpan={columns.length + 1} style={{ padding: 0 }}>
                          <Collapse in={expanded}>
                            <Box p="md" style={{ background: 'var(--bg-primary)' }}>
                              {expandedContent(row)}
                            </Box>
                          </Collapse>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </React.Fragment>
                );
              })}
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

export default ExpandableTable;