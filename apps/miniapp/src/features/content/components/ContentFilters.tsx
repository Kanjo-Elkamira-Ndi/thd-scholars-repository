import type { ContentDeliveryStatus, ContentFormat, DisciplineTag } from '@thd/shared';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/shared/FilterBar';
import { FilterSelect } from '@/components/shared/FilterSelect';
import { SearchInput } from '@/components/shared/SearchInput';
import { contentDeliveryLabel } from '@/components/shared/StatusPill';
import { DISCIPLINE_OPTIONS, FORMAT_OPTIONS } from '../labels';

export interface ContentFilterValue {
  search?: string;
  disciplineTag?: DisciplineTag;
  formatTag?: ContentFormat;
  cohortYear?: number;
  mine?: boolean;
  deliveryStatus?: ContentDeliveryStatus;
}

const DELIVERY_STATUSES: ContentDeliveryStatus[] = [
  'pending',
  'processing',
  'posted',
  'failed',
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...DELIVERY_STATUSES.map((status) => ({ value: status, label: contentDeliveryLabel(status) })),
];

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
  /** Author-facing filters (mine / delivery status) are only offered to faculty and admins. */
  showAuthorFilters?: boolean;
}

export function ContentFilters({ value, onChange, showAuthorFilters = false }: ContentFiltersProps) {
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
        {showAuthorFilters ? (
          <>
            <Button
              type="button"
              variant={value.mine ? 'default' : 'outline'}
              aria-pressed={Boolean(value.mine)}
              className="h-11 shrink-0"
              onClick={() => onChange({ ...value, mine: value.mine ? undefined : true })}
            >
              Only mine
            </Button>
            <FilterSelect
              label="Delivery status"
              options={STATUS_OPTIONS}
              value={value.deliveryStatus ?? ''}
              onChange={(event) =>
                onChange({
                  ...value,
                  deliveryStatus: (event.target.value || undefined) as
                    | ContentDeliveryStatus
                    | undefined,
                })
              }
            />
          </>
        ) : null}
      </FilterBar>
    </div>
  );
}
