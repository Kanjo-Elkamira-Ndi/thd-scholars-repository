import type { ContentFormat, DisciplineTag } from '@thd/shared';
import { FilterBar } from '@/components/shared/FilterBar';
import { FilterSelect } from '@/components/shared/FilterSelect';
import { SearchInput } from '@/components/shared/SearchInput';
import { DISCIPLINE_OPTIONS, FORMAT_OPTIONS } from '../labels';

export interface ContentFilterValue {
  search?: string;
  disciplineTag?: DisciplineTag;
  formatTag?: ContentFormat;
  cohortYear?: number;
}

function cohortOptions(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear();
  const options = [{ value: '', label: 'All cohorts' }];
  for (let year = currentYear; year >= currentYear - 10; year -= 1) {
    options.push({ value: String(year), label: String(year) });
  }
  return options;
}

interface ContentFiltersProps {
  value: ContentFilterValue;
  onChange: (value: ContentFilterValue) => void;
}

export function ContentFilters({ value, onChange }: ContentFiltersProps) {
  return (
    <div className="space-y-2">
      <SearchInput
        aria-label="Search content"
        placeholder="Search the library"
        defaultValue={value.search ?? ''}
        onChange={(search) => onChange({ ...value, search: search || undefined })}
      />
      <FilterBar>
        <FilterSelect
          label="Discipline"
          options={DISCIPLINE_OPTIONS}
          value={value.disciplineTag ?? ''}
          onChange={(event) =>
            onChange({
              ...value,
              disciplineTag: (event.target.value || undefined) as DisciplineTag | undefined,
            })
          }
        />
        <FilterSelect
          label="Format"
          options={FORMAT_OPTIONS}
          value={value.formatTag ?? ''}
          onChange={(event) =>
            onChange({
              ...value,
              formatTag: (event.target.value || undefined) as ContentFormat | undefined,
            })
          }
        />
        <FilterSelect
          label="Cohort"
          options={cohortOptions()}
          value={value.cohortYear ? String(value.cohortYear) : ''}
          onChange={(event) =>
            onChange({
              ...value,
              cohortYear: event.target.value ? Number(event.target.value) : undefined,
            })
          }
        />
      </FilterBar>
    </div>
  );
}
