import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  type Theme,
} from '@mui/material';
import { useCallback, useId, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { AttachmentsSection } from '@/features/crm/common/AttachmentsSection';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { useCan, usePermission } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { ApiError } from '@/services/api/api-error';

import { headerActions } from './capabilities';
import { CommercialStatusChip } from './components/CommercialStatusChip';
import { DeleteProjectDialog } from './components/DeleteProjectDialog';
import { DuplicateProjectDialog } from './components/DuplicateProjectDialog';
import { EditProjectDialog } from './components/EditProjectDialog';
import { PhaseChip } from './components/PhaseChip';
import type { ProjectCreatedState } from './ProjectCreatePage';
import { takePendingUploads } from './pending-uploads';
import { formatDateTime } from './project-format';
import { projectDetailPath } from './project-paths';
import { projectAttachmentsPath, type ProjectDetail, type ProjectFormOptions } from './projects.api';
import { PROJECT_ERROR_MESSAGES, withReference } from './projects.errors';
import { FORECAST_PERMISSIONS, OPPORTUNITY_PERMISSIONS, PROJECT_PERMISSIONS } from './projects.permissions';
import { useProject, useProjectFormOptions } from './projects.queries';
import { ProjectClassificationSection } from './sections/ProjectClassificationSection';
import { ProjectFollowUpSection } from './sections/ProjectFollowUpSection';
import { ProjectForecastSection } from './sections/ProjectForecastSection';
import { ProjectGeneralSection } from './sections/ProjectGeneralSection';
import { ProjectHistorySection } from './sections/ProjectHistorySection';
import { ProjectOpportunitiesSection } from './sections/ProjectOpportunitiesSection';
import { ProjectPhaseSection } from './sections/ProjectPhaseSection';
import { ProjectProductsSection } from './sections/ProjectProductsSection';
import { ProjectResultsSection } from './sections/ProjectResultsSection';

/** Parámetro de la URL que abre una sección (03 §E.4). */
export const SECTION_PARAM = 'seccion';

/** Las diez secciones de la ficha (03 §B.2), con su clave en `?seccion=`. */
const SECTIONS = [
  { key: 'general', label: 'General' },
  { key: 'clasificacion', label: 'Clasificación' },
  { key: 'fase', label: 'Fase' },
  { key: 'oportunidades', label: 'Oportunidades' },
  { key: 'resultados', label: 'Resultados' },
  { key: 'productos', label: 'Productos' },
  { key: 'forecast', label: 'Forecast' },
  { key: 'seguimiento', label: 'Seguimiento' },
  { key: 'adjuntos', label: 'Adjuntos' },
  { key: 'historial', label: 'Historial' },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

/** Permisos del Módulo 4 con los que la sección de seguimiento tiene sentido (03 §G.3). */
const FOLLOW_UP_PERMISSIONS = ['actividades.ver', 'visitas.ver'] as const;

function isCreatedState(state: unknown): state is ProjectCreatedState {
  return typeof state === 'object' && state !== null && typeof (state as ProjectCreatedState).createdMessage === 'string';
}

interface SectionContext {
  project: ProjectDetail;
  options: ProjectFormOptions | undefined;
  takeInitialFiles: () => readonly File[];
}

/** Monta sólo la sección abierta: cada una carga sus datos bajo demanda y falla por separado. */
function renderSection(key: SectionKey, { project, options, takeInitialFiles }: SectionContext): ReactNode {
  switch (key) {
    case 'general':
      return <ProjectGeneralSection project={project} />;
    case 'clasificacion':
      return <ProjectClassificationSection project={project} options={options} />;
    case 'fase':
      return <ProjectPhaseSection project={project} options={options} />;
    case 'oportunidades':
      return <ProjectOpportunitiesSection project={project} />;
    case 'resultados':
      return <ProjectResultsSection project={project} />;
    case 'productos':
      return <ProjectProductsSection project={project} options={options} />;
    case 'forecast':
      return <ProjectForecastSection project={project} />;
    case 'seguimiento':
      return <ProjectFollowUpSection project={project} />;
    case 'adjuntos':
      return (
        <AttachmentsSection
          basePath={projectAttachmentsPath(project.id)}
          canManage={project.capabilities.canEdit}
          limits={options?.attachments}
          emptyMessage="Este proyecto no tiene adjuntos"
          takeInitialFiles={takeInitialFiles}
        />
      );
    case 'historial':
      return <ProjectHistorySection projectId={project.id} />;
  }
}

interface SectionNavigationProps {
  sections: readonly { key: SectionKey; label: string }[];
  active: SectionKey;
  onChange: (key: SectionKey) => void;
  context: SectionContext;
}

/** Escritorio: pestañas desplazables con un panel. */
function SectionTabs({ sections, active, onChange, context }: SectionNavigationProps) {
  const baseId = useId();
  return (
    <>
      <Card sx={{ mb: 2 }}>
        <Tabs
          value={active}
          onChange={(_, value: SectionKey) => onChange(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Secciones del proyecto"
        >
          {sections.map((section) => (
            <Tab
              key={section.key}
              value={section.key}
              label={section.label}
              id={`${baseId}-tab-${section.key}`}
              aria-controls={`${baseId}-panel-${section.key}`}
            />
          ))}
        </Tabs>
      </Card>
      <Box role="tabpanel" id={`${baseId}-panel-${active}`} aria-labelledby={`${baseId}-tab-${active}`}>
        {renderSection(active, context)}
      </Box>
    </>
  );
}

/** Móvil: acordeón vertical; sólo la sección desplegada carga sus datos. */
function SectionAccordion({ sections, active, onChange, context }: SectionNavigationProps) {
  return (
    <Stack spacing={1}>
      {sections.map((section) => {
        const expanded = section.key === active;
        return (
          <Accordion key={section.key} expanded={expanded} onChange={() => onChange(section.key)} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography sx={{ fontWeight: 'fontWeightMedium' }}>{section.label}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>{expanded ? renderSection(section.key, context) : null}</AccordionDetails>
          </Accordion>
        );
      })}
    </Stack>
  );
}

function ProjectDetailContent({ project }: { project: ProjectDetail }) {
  const navigate = useNavigate();
  const location = useLocation();
  const can = useCan();
  const canAdminister = usePermission(PROJECT_PERMISSIONS.administer);
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down('md'));
  const options = useProjectFormOptions();
  const [editing, setEditing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(isCreatedState(location.state) ? location.state.createdMessage : null);
  const takeInitialFiles = useCallback(() => takePendingUploads(project.id), [project.id]);

  const sections = SECTIONS.filter((section) => {
    switch (section.key) {
      case 'oportunidades':
      case 'resultados':
        return can(OPPORTUNITY_PERMISSIONS.view);
      case 'forecast':
        return can(FORECAST_PERMISSIONS.view);
      case 'seguimiento':
        return FOLLOW_UP_PERMISSIONS.some((permission) => can(permission));
      default:
        return true;
    }
  });
  const requested = searchParams.get(SECTION_PARAM);
  const active: SectionKey = sections.find((section) => section.key === requested)?.key ?? 'general';
  const setActive = (key: SectionKey) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set(SECTION_PARAM, key);
        return next;
      },
      { replace: true },
    );

  const actions = headerActions(project.capabilities);
  const context: SectionContext = { project, options: options.data, takeInitialFiles };

  const headerButtons = (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      {actions.edit ? (
        <Button startIcon={<EditOutlinedIcon />} onClick={() => setEditing(true)}>
          Editar
        </Button>
      ) : null}
      {actions.duplicate ? (
        <Button variant="outlined" startIcon={<ContentCopyOutlinedIcon />} onClick={() => setDuplicating(true)}>
          Duplicar
        </Button>
      ) : null}
      {actions.remove ? (
        <Button variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setDeleting(true)}>
          Eliminar
        </Button>
      ) : null}
    </Stack>
  );

  return (
    <>
      <PageHeader
        title={project.name}
        context={project.code}
        subtitle={`${project.customer.legalName} · Asesor: ${project.owner.displayName} · Última actualización: ${formatDateTime(project.lastActivityAt)}`}
        breadcrumbs={crmBreadcrumbs({ label: 'Proyectos', to: ROUTE_PATHS.crm.projects.search }, { label: 'Ficha' })}
        actions={headerButtons}
        metrics={
          <Stack direction="row" spacing={1}>
            <PhaseChip label={project.phase.phase.label} progress={project.phase.progress} isFinal={project.phase.phase.isFinal} />
            <CommercialStatusChip status={project.commercialStatus} />
          </Stack>
        }
      />

      {notice ? (
        <Alert severity="success" role="status" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      ) : null}
      {!project.capabilities.canEdit ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Puedes consultar este proyecto, pero no editarlo.
        </Alert>
      ) : null}

      {isMobile ? (
        <SectionAccordion sections={sections} active={active} onChange={setActive} context={context} />
      ) : (
        <SectionTabs sections={sections} active={active} onChange={setActive} context={context} />
      )}

      {actions.edit ? (
        <EditProjectDialog
          open={editing}
          project={project}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            setNotice(`Proyecto ${saved.code} actualizado.`);
          }}
        />
      ) : null}
      {actions.duplicate ? (
        <DuplicateProjectDialog
          open={duplicating}
          project={project}
          canAdminister={canAdminister}
          onClose={() => setDuplicating(false)}
          onDuplicated={(created) => {
            setDuplicating(false);
            const state: ProjectCreatedState = { createdMessage: `Proyecto ${created.code} creado a partir de ${project.code}.` };
            navigate(projectDetailPath(created.id), { state });
          }}
        />
      ) : null}
      {actions.remove ? (
        <DeleteProjectDialog
          open={deleting}
          project={project}
          onClose={() => setDeleting(false)}
          onDeleted={() => navigate(ROUTE_PATHS.crm.projects.search)}
        />
      ) : null}
    </>
  );
}

/**
 * Ficha del proyecto (03 §E.4, F-11). Ruta protegida con `proyectos.ver`.
 *
 * Diez secciones (pestañas en escritorio, acordeón en móvil; `?seccion=` abre
 * una). Cada sección carga y falla por separado. Las acciones salen de las
 * `capabilities` del proyecto (las calcula el backend con la misma política
 * que aplica); ocultarlas es experiencia de usuario, no seguridad. Inexistente,
 * eliminado o fuera del alcance responden el mismo `404` (AC-03.12).
 */
export function ProjectDetailPage() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const project = useProject(projectId);
  const breadcrumbs = crmBreadcrumbs({ label: 'Proyectos', to: ROUTE_PATHS.crm.projects.search }, { label: 'Ficha' });

  if (project.isPending) {
    return (
      <>
        <PageHeader title="Ficha del proyecto" breadcrumbs={breadcrumbs} />
        <Card>
          <Stack role="status" aria-label="Cargando el proyecto" spacing={1.5} sx={{ p: 3 }}>
            <Skeleton variant="text" sx={{ width: '40%' }} />
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} variant="text" />
            ))}
          </Stack>
        </Card>
      </>
    );
  }

  if (project.isError) {
    const notFound = project.error instanceof ApiError && project.error.isNotFound;
    return (
      <>
        <PageHeader title="Ficha del proyecto" breadcrumbs={breadcrumbs} />
        <Card>
          {notFound ? (
            <EmptyState
              icon={<SearchOffOutlinedIcon />}
              title="Este proyecto no existe o no tienes acceso"
              description="Puede que lo hayan eliminado o que no esté en tu alcance."
              action={<Button onClick={() => navigate(ROUTE_PATHS.crm.projects.search)}>Volver a la búsqueda</Button>}
            />
          ) : (
            <EmptyState
              role="alert"
              title="No se pudo cargar el proyecto"
              description={withReference(describeApiError(project.error, PROJECT_ERROR_MESSAGES))}
              action={
                <Button variant="outlined" onClick={() => void project.refetch()}>
                  Reintentar
                </Button>
              }
            />
          )}
        </Card>
      </>
    );
  }

  return <ProjectDetailContent key={project.data.id} project={project.data} />;
}
