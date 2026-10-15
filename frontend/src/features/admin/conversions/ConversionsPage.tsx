import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import ToggleOffOutlinedIcon from '@mui/icons-material/ToggleOffOutlined';
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined';
import {
  Box,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  AdminListCard,
  adminBreadcrumbs,
  ConfirmDialog,
  DataTable,
  describeApiError,
  FilterChips,
  ListToolbar,
  recordsSubtitle,
  RefreshTool,
  useTableQueryState,
  type DataTableColumn,
} from '@/features/admin/common';
import { useCan } from '@/hooks/use-permission';

import { ConversionRuleFormDialog } from './components/ConversionRuleFormDialog';
import type { ConversionRule } from './conversions.api';
import {
  formatFactor,
  isIdentityRule,
  isProtectedRule,
  SCOPE_FILTER_CHIPS,
  SCOPE_LABELS,
  scopeReference,
} from './conversions-format';
import { CONVERSION_PERMISSIONS } from './conversions.permissions';
import {
  conversionKeys,
  useConversionRules,
  useTonnageUnitCode,
  useUnitOptions,
  useUpdateConversionRule,
} from './conversions.queries';

const TITLE = 'Conversiones';
const DESCRIPTION = 'Reglas para convertir cantidades a la unidad de tonelaje.';
const FILTER_KEYS = ['scope', 'fromUnitId'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
const ALL_UNITS = '';
/** Lista blanca de `GET /unit-conversion-rules` (columnas ordenables: factor y ámbito). */
const SORTABLE = ['createdAt', 'updatedAt', 'scope', 'factor'] as const;

type FormState = { open: false } | { open: true; rule: ConversionRule | null };

/**
 * Pantalla «Conversiones» (07 E.5, RN-07.36): reglas de conversión con filtros
 * por ámbito y unidad de origen en la URL, alta, edición del factor y
 * activar/desactivar; sin borrado. La regla identidad está protegida. La ruta
 * exige `productos.ver`; las acciones, `productos.configurar`.
 */
export function ConversionsPage() {
  const can = useCan();
  const canConfigure = can(CONVERSION_PERMISSIONS.configure);
  const canUseProjectTypes = can(CONVERSION_PERMISSIONS.viewCatalogs);
  const table = useTableQueryState<FilterKey>({
    filterKeys: FILTER_KEYS,
    sortableFields: SORTABLE,
  });
  const rules = useConversionRules(table.apiQuery);
  const units = useUnitOptions();
  const tonnageCode = useTonnageUnitCode(can(CONVERSION_PERMISSIONS.viewParameters));
  const toggleMutation = useUpdateConversionRule();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({ open: false });
  const [toToggle, setToToggle] = useState<ConversionRule | null>(null);

  const tonnageUnit = (units.data ?? []).find((unit) => unit.code === tonnageCode.data) ?? null;

  const columns: DataTableColumn<ConversionRule>[] = [
    {
      id: 'rule',
      header: 'Regla',
      render: (rule) => (
        <Stack direction="row" spacing={1} alignItems="center" component="span">
          <Box component="span" sx={{ fontWeight: 600 }}>
            {rule.fromUnit.code} → {rule.toUnit.code}
          </Box>
          {isProtectedRule(rule) ? (
            <Chip
              size="small"
              variant="outlined"
              icon={<LockOutlinedIcon />}
              label="Identidad protegida"
            />
          ) : isIdentityRule(rule) ? (
            <Chip size="small" variant="outlined" label="Identidad" />
          ) : null}
        </Stack>
      ),
      primary: true,
    },
    {
      id: 'factor',
      header: 'Factor',
      render: (rule) => (
        <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatFactor(rule.factor)}
        </Box>
      ),
      align: 'right',
      sortable: true,
    },
    {
      id: 'scope',
      header: 'Ámbito',
      render: (rule) => {
        const reference = scopeReference(rule);
        return (
          <Stack component="span">
            <span>{SCOPE_LABELS[rule.scope] ?? rule.scope}</span>
            {reference ? (
              <Typography component="span" variant="caption" color="text.secondary">
                {reference}
              </Typography>
            ) : null}
          </Stack>
        );
      },
      sortable: true,
    },
    {
      id: 'description',
      header: 'Descripción',
      render: (rule) => rule.description ?? '—',
      hideOnMobile: true,
    },
    {
      id: 'isActive',
      header: 'Estado',
      render: (rule) => (
        <Chip
          size="small"
          color={rule.isActive ? 'success' : 'default'}
          label={rule.isActive ? 'Activa' : 'Inactiva'}
        />
      ),
    },
  ];

  const ruleName = (rule: ConversionRule) => `${rule.fromUnit.code} → ${rule.toUnit.code}`;
  const rowActions = canConfigure
    ? (rule: ConversionRule) => {
        const locked = isProtectedRule(rule);
        return (
          <>
            <IconButton
              aria-label={`Editar ${ruleName(rule)}`}
              onClick={() => setForm({ open: true, rule })}
            >
              <EditOutlinedIcon />
            </IconButton>
            {locked ? null : (
              <Tooltip title={rule.isActive ? 'Desactivar' : 'Activar'}>
                <IconButton
                  aria-label={`${rule.isActive ? 'Desactivar' : 'Activar'} ${ruleName(rule)}`}
                  onClick={() => {
                    toggleMutation.reset();
                    setToToggle(rule);
                  }}
                >
                  {rule.isActive ? (
                    <ToggleOnOutlinedIcon color="success" />
                  ) : (
                    <ToggleOffOutlinedIcon />
                  )}
                </IconButton>
              </Tooltip>
            )}
          </>
        );
      }
    : undefined;

  const hasFilters = Boolean(table.state.filters.scope || table.state.filters.fromUnitId);

  return (
    <>
      <PageHeader title={TITLE} breadcrumbs={adminBreadcrumbs(TITLE)} />
      <AdminListCard
        icon={<SwapHorizOutlinedIcon />}
        title={TITLE}
        subtitle={recordsSubtitle(rules.data?.pagination.totalItems, DESCRIPTION, [
          'regla',
          'reglas',
        ])}
        tools={
          <RefreshTool
            busy={rules.isFetching}
            onRefresh={() => void queryClient.invalidateQueries({ queryKey: conversionKeys.all })}
          />
        }
        toolbar={
          <ListToolbar
            filters={
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={1.5}
                alignItems={{ md: 'center' }}
                sx={{ minWidth: 0 }}
              >
                <FilterChips
                  label="Filtrar por ámbito"
                  value={table.state.filters.scope ?? ''}
                  onChange={(value) => table.setFilter('scope', value || undefined)}
                  options={SCOPE_FILTER_CHIPS}
                />
                <TextField
                  select
                  size="small"
                  label="Unidad de origen"
                  value={table.state.filters.fromUnitId ?? ALL_UNITS}
                  onChange={(event) =>
                    table.setFilter('fromUnitId', event.target.value || undefined)
                  }
                  sx={{ minWidth: (theme) => theme.spacing(22) }}
                >
                  <MenuItem value={ALL_UNITS}>Todas</MenuItem>
                  {(units.data ?? []).map((unit) => (
                    <MenuItem key={unit.id} value={unit.id}>
                      {unit.name} ({unit.code})
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            }
            primaryAction={
              canConfigure
                ? { label: 'Nueva regla', onClick: () => setForm({ open: true, rule: null }) }
                : undefined
            }
          />
        }
      >
        <DataTable
          label="Reglas de conversión"
          columns={columns}
          rows={rules.data?.data}
          getRowId={(rule) => rule.id}
          totalItems={rules.data?.pagination.totalItems ?? 0}
          page={table.state.page}
          pageSize={table.state.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          sort={table.state.sort}
          onSortChange={table.setSort}
          isLoading={rules.isPending}
          isFetching={rules.isFetching}
          errorMessage={rules.isError ? describeApiError(rules.error).message : null}
          onRetry={() => void rules.refetch()}
          emptyTitle="No hay reglas de conversión"
          emptyDescription={hasFilters ? 'Prueba con otro ámbito u otra unidad.' : undefined}
          rowActions={rowActions}
        />
      </AdminListCard>

      <ConversionRuleFormDialog
        open={form.open}
        rule={form.open ? form.rule : null}
        units={units.data ?? []}
        tonnageUnit={tonnageUnit}
        canUseProjectTypes={canUseProjectTypes}
        referenceLabel={form.open && form.rule ? scopeReference(form.rule) : null}
        onClose={() => setForm({ open: false })}
      />
      <ConfirmDialog
        open={toToggle !== null}
        title={toToggle?.isActive ? 'Desactivar regla' : 'Activar regla'}
        description={
          toToggle
            ? toToggle.isActive
              ? `«${ruleName(toToggle)}» dejará de aplicarse a las cantidades nuevas. Las líneas existentes conservan su factor.`
              : `«${ruleName(toToggle)}» volverá a aplicarse a las cantidades nuevas.`
            : undefined
        }
        confirmLabel={toToggle?.isActive ? 'Desactivar' : 'Activar'}
        destructive={toToggle?.isActive ?? false}
        isPending={toggleMutation.isPending}
        errorMessage={
          toggleMutation.isError ? describeApiError(toggleMutation.error).message : null
        }
        onConfirm={() => {
          if (toToggle) {
            toggleMutation.mutate(
              { id: toToggle.id, body: { isActive: !toToggle.isActive } },
              { onSuccess: () => setToToggle(null) },
            );
          }
        }}
        onClose={() => setToToggle(null)}
      />
    </>
  );
}
