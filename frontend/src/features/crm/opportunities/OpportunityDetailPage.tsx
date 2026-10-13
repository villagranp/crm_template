import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import { Alert, Box, Button, Card, Link, Skeleton, Stack, Typography } from '@mui/material';
import { useId, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';

import { ConfirmDialog, DetailList, EmptyState } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { formatMoney, formatPercent } from '@/features/crm/common/decimal';
import { formatCalendarDate, formatDateTime, orDash, projectDetailPath, withReference } from '@/features/crm/projects';
import { describeApiError } from '@/lib/api-error-view';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { ApiError } from '@/services/api/api-error';

import { OpportunityFormDialog } from './components/OpportunityFormDialog';
import { OpportunityHistoryPanel } from './components/OpportunityHistory';
import { OutcomeChip } from './components/OutcomeChip';
import { ResultEditDialog } from './components/ResultEditDialog';
import { StageChangeDialog } from './components/StageChangeDialog';
import { StageChip } from './components/StageChip';
import type { OpportunityDetail } from './opportunities.api';
import { describeDependencies, OPPORTUNITY_ERROR_MESSAGES, staleRateMessage } from './opportunities.errors';
import { useDeleteOpportunity, useOpportunity, useOpportunityFormOptions } from './opportunities.queries';
import { estimateTexts, exchangeRateText, OPPORTUNITY_FIELD_LABELS, outcomeLabel } from './opportunity-format';

const BREADCRUMBS = crmBreadcrumbs(
  { label: 'Proyectos', to: ROUTE_PATHS.crm.projects.search },
  { label: 'Oportunidades', to: ROUTE_PATHS.crm.projects.opportunities },
  { label: 'Detalle' },
);

interface Notice {
  severity: 'success' | 'warning';
  message: string;
}

function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <Card component="section" aria-labelledby={titleId} sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Typography id={titleId} variant="h6" component="h2" sx={{ mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Card>
  );
}

function OpportunityDetailContent({ opportunity }: { opportunity: OpportunityDetail }) {
  const navigate = useNavigate();
  const options = useOpportunityFormOptions();
  const removal = useDeleteOpportunity(opportunity.id, opportunity.project.id);
  const [editing, setEditing] = useState(false);
  const [changingStage, setChangingStage] = useState(false);
  const [editingResult, setEditingResult] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const { capabilities } = opportunity;
  const projectLink = `${projectDetailPath(opportunity.project.id)}?seccion=oportunidades`;
  const estimate = estimateTexts(opportunity);
  const outcomes = options.data?.outcomes;

  const dependencies = describeDependencies(removal.error);
  const removeError = removal.isError
    ? dependencies
      ? `No se puede eliminar: tiene ${dependencies}.`
      : withReference(describeApiError(removal.error, OPPORTUNITY_ERROR_MESSAGES))
    : null;

  const actions = (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      {capabilities.canEdit ? (
        <Button startIcon={<EditOutlinedIcon />} onClick={() => setEditing(true)}>
          Editar
        </Button>
      ) : null}
      {capabilities.canEdit && opportunity.allowedTransitions.length > 0 ? (
        <Button variant="outlined" startIcon={<SwapHorizOutlinedIcon />} onClick={() => setChangingStage(true)}>
          Cambiar etapa
        </Button>
      ) : null}
      {capabilities.canClose && opportunity.result ? (
        <Button variant="outlined" startIcon={<FactCheckOutlinedIcon />} onClick={() => setEditingResult(true)}>
          Modificar resultado
        </Button>
      ) : null}
      {capabilities.canDelete ? (
        <Button variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setDeleting(true)}>
          Eliminar
        </Button>
      ) : null}
    </Stack>
  );

  return (
    <>
      <PageHeader
        title={opportunity.code}
        context={opportunity.project.code}
        subtitle={`${opportunity.project.name} · ${opportunity.customer.legalName} · Asesor: ${opportunity.owner.displayName}`}
        breadcrumbs={BREADCRUMBS}
        actions={actions}
        metrics={
          <Stack direction="row" spacing={1}>
            <StageChip stage={opportunity.stage} />
            {opportunity.result ? <OutcomeChip result={opportunity.result} options={outcomes} /> : null}
          </Stack>
        }
      />

      {notice ? (
        <Alert severity={notice.severity} role="status" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice.message}
        </Alert>
      ) : null}
      {!capabilities.canEdit ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Puedes consultar esta oportunidad, pero no editarla.
        </Alert>
      ) : null}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' } }}>
        <DetailCard title="Datos de la oportunidad">
          <DetailList
            items={[
              {
                label: OPPORTUNITY_FIELD_LABELS.projectId,
                value: (
                  <Link component={RouterLink} to={projectLink}>
                    {`${opportunity.project.code} · ${opportunity.project.name}`}
                  </Link>
                ),
                wide: true,
              },
              { label: OPPORTUNITY_FIELD_LABELS.customerId, value: opportunity.customer.legalName },
              { label: OPPORTUNITY_FIELD_LABELS.ownerId, value: opportunity.owner.displayName },
              { label: OPPORTUNITY_FIELD_LABELS.opportunityDate, value: formatCalendarDate(opportunity.opportunityDate) },
              { label: 'Etapa desde', value: formatDateTime(opportunity.stageChangedAt) },
              { label: OPPORTUNITY_FIELD_LABELS.nextAction, value: orDash(opportunity.nextAction) },
              { label: OPPORTUNITY_FIELD_LABELS.nextActionDate, value: formatCalendarDate(opportunity.nextActionDate) },
              { label: OPPORTUNITY_FIELD_LABELS.description, value: orDash(opportunity.description), wide: true },
              {
                label: 'Alta',
                value: opportunity.createdBy ? `${opportunity.createdBy.displayName} · ${formatDateTime(opportunity.createdAt)}` : formatDateTime(opportunity.createdAt),
              },
              {
                label: 'Última actualización',
                value: opportunity.updatedBy ? `${opportunity.updatedBy.displayName} · ${formatDateTime(opportunity.updatedAt)}` : formatDateTime(opportunity.updatedAt),
              },
            ]}
          />
        </DetailCard>

        <DetailCard title="Estimación">
          <DetailList
            items={[
              { label: 'Monto original', value: estimate.original },
              { label: 'Equivalente en USD', value: formatMoney(opportunity.estimatedAmountUsd, 'USD') },
              { label: 'Tipo de cambio aplicado', value: exchangeRateText(opportunity), wide: true },
              { label: OPPORTUNITY_FIELD_LABELS.estimatedTonnage, value: estimate.tonnage ?? '—' },
            ]}
          />
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
            El tipo de cambio es una foto: solo se recalcula si cambian el monto, la moneda o la fecha de la oportunidad.
          </Typography>
        </DetailCard>

        <DetailCard title="Resultado vigente">
          {opportunity.result ? (
            <DetailList
              items={[
                { label: OPPORTUNITY_FIELD_LABELS.outcome, value: opportunity.result.outcomeLabel || outcomeLabel(opportunity.result.outcome, outcomes) },
                { label: OPPORTUNITY_FIELD_LABELS.awardedPercent, value: opportunity.result.awardedPercent ? formatPercent(opportunity.result.awardedPercent) : '—' },
                { label: OPPORTUNITY_FIELD_LABELS.reasonId, value: opportunity.result.reason?.label ?? '—' },
                { label: OPPORTUNITY_FIELD_LABELS.decisionDate, value: formatCalendarDate(opportunity.result.decisionDate) },
                { label: OPPORTUNITY_FIELD_LABELS.comments, value: orDash(opportunity.result.comments), wide: true },
                { label: 'Registrado por', value: `${opportunity.result.recordedBy.displayName} · ${formatDateTime(opportunity.result.recordedAt)}`, wide: true },
              ]}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              {opportunity.stage.isClosed ? 'Sin resultado registrado.' : 'La oportunidad está abierta: el resultado se registra al cerrarla.'}
            </Typography>
          )}
        </DetailCard>

        <DetailCard title="Productos asociados">
          <Typography variant="body2" sx={{ mb: 1 }}>
            {opportunity.productLines === 1 ? '1 producto asociado activo con esta oportunidad.' : `${opportunity.productLines} productos asociados activos con esta oportunidad.`}
          </Typography>
          <Link component={RouterLink} to={`${projectDetailPath(opportunity.project.id)}?seccion=productos`}>
            Ver los productos en la ficha del proyecto
          </Link>
        </DetailCard>

        <DetailCard title="Historial de etapas">
          <OpportunityHistoryPanel opportunityId={opportunity.id} show="stages" />
        </DetailCard>

        <DetailCard title="Historial de resultados">
          <OpportunityHistoryPanel opportunityId={opportunity.id} show="results" outcomes={outcomes} />
        </DetailCard>
      </Box>

      {capabilities.canEdit ? (
        <OpportunityFormDialog
          open={editing}
          projectId={opportunity.project.id}
          projectLabel={`${opportunity.project.code} · ${opportunity.project.name}`}
          opportunity={opportunity}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            const stale = staleRateMessage(saved.warnings);
            setNotice(stale ? { severity: 'warning', message: stale } : { severity: 'success', message: `Oportunidad ${saved.code} actualizada.` });
          }}
        />
      ) : null}
      <StageChangeDialog
        open={changingStage}
        opportunityId={opportunity.id}
        onClose={() => setChangingStage(false)}
        onChanged={(updated) => {
          setChangingStage(false);
          setNotice({ severity: 'success', message: `Oportunidad en ${updated.stage.label}.` });
        }}
      />
      <ResultEditDialog
        open={editingResult}
        opportunityId={opportunity.id}
        onClose={() => setEditingResult(false)}
        onSaved={() => {
          setEditingResult(false);
          setNotice({ severity: 'success', message: 'Resultado actualizado.' });
        }}
      />
      <ConfirmDialog
        open={deleting}
        destructive
        title="Eliminar oportunidad"
        description={`«${opportunity.code}» dejará de aparecer en listas y conteos. Su historia se conserva.`}
        confirmLabel="Eliminar"
        isPending={removal.isPending}
        errorMessage={removeError}
        onConfirm={() => removal.mutate(undefined, { onSuccess: () => navigate(projectLink) })}
        onClose={() => {
          setDeleting(false);
          removal.reset();
        }}
      />
    </>
  );
}

/**
 * Detalle de oportunidad (03 §E.7, F-17, F-18). Ruta protegida con
 * `oportunidades.ver`; destino de las alertas de Inicio.
 *
 * Datos, estimación (monto original, tasa aplicada con su fecha y equivalente
 * en USD, RN-03.83), resultado vigente, historiales y enlace al proyecto. Las
 * acciones salen de `capabilities` y `allowedTransitions`, que calcula el
 * backend. Inexistente o fuera de alcance responden el mismo `404`.
 */
export function OpportunityDetailPage() {
  const { opportunityId = '' } = useParams<{ opportunityId: string }>();
  const navigate = useNavigate();
  const opportunity = useOpportunity(opportunityId);

  if (opportunity.isPending) {
    return (
      <>
        <PageHeader title="Detalle de oportunidad" breadcrumbs={BREADCRUMBS} />
        <Card>
          <Stack role="status" aria-label="Cargando la oportunidad" spacing={1.5} sx={{ p: 3 }}>
            <Skeleton variant="text" sx={{ width: '40%' }} />
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} variant="text" />
            ))}
          </Stack>
        </Card>
      </>
    );
  }

  if (opportunity.isError) {
    const notFound = opportunity.error instanceof ApiError && opportunity.error.isNotFound;
    return (
      <>
        <PageHeader title="Detalle de oportunidad" breadcrumbs={BREADCRUMBS} />
        <Card>
          {notFound ? (
            <EmptyState
              icon={<SearchOffOutlinedIcon />}
              title="Esta oportunidad no existe o no tienes acceso"
              description="Puede que la hayan eliminado o que no esté en tu alcance."
              action={<Button onClick={() => navigate(ROUTE_PATHS.crm.projects.opportunities)}>Volver al pipeline</Button>}
            />
          ) : (
            <EmptyState
              role="alert"
              title="No se pudo cargar la oportunidad"
              description={withReference(describeApiError(opportunity.error, OPPORTUNITY_ERROR_MESSAGES))}
              action={
                <Button variant="outlined" onClick={() => void opportunity.refetch()}>
                  Reintentar
                </Button>
              }
            />
          )}
        </Card>
      </>
    );
  }

  return <OpportunityDetailContent key={opportunity.data.id} opportunity={opportunity.data} />;
}
