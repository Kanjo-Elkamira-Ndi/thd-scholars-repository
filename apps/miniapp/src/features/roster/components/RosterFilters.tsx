import type { RosterStatus } from '@thd/shared';
import { FilterBar } from '@/components/shared/FilterBar';
import { FilterSelect } from '@/components/shared/FilterSelect';
import { SearchInput } from '@/components/shared/SearchInput';

export interface RosterFilterValue {
  search?: string;
  status?: RosterStatus;
  cohortYear?: number;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'pending', label: 'Pending' },
];

function cohortOptions(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear();
  const options = [{ value: '', label: 'All cohorts' }];
  for (let year = currentYear; year >= currentYear - 10; year -= 1) {
    options.push({ value: String(year), label: `${year}` });
  }
  return options;
}

interface RosterFiltersProps {
  value: RosterFilterValue;
  onChange: (patch: RosterFilterValue) => void;
}

export function RosterFilters({ value, onChange }: RosterFiltersProps) {
  return (
    <div className="space-y-2">
      <SearchInput
        aria-label="Search roster"
        placeholder="Search by registration ID or name"
        defaultValue={value.search ?? ''}
        onChange={(search) => onChange({ search: search || undefined })}
      />
      <FilterBar>
        <FilterSelect
          label="Status"
          options={STATUS_OPTIONS}
          value={value.status ?? ''}
          onChange={(event) =>
            onChange({ status: (event.target.value || undefined) as RosterStatus | undefined })
          }
        />
        <FilterSelect
          label="Cohort"
          options={cohortOptions()}
          value={value.cohortYear ? String(value.cohortYear) : ''}
          onChange={(event) =>
            onChange({ cohortYear: event.target.value ? Number(event.target.value) : undefined })
          }
        />
      </FilterBar>
    </div>
  );
}
