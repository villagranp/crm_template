import { Link, Stack } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { DetailList, DetailSection } from '@/components/data';
import { customerDetailPath } from '@/features/crm/customers';
import { usePermission } from '@/hooks/use-permission';

import { CommercialStatusChip } from '../components/CommercialStatusChip';
import { formatCalendarDate, formatDateTime, orDash, PROJECT_FIELD_LABELS } from '../project-format';
import { projectDetailPath } from '../project-paths';
import type { ProjectDetail, UserRef } from '../projects.api';

import { SectionCard } from './SectionCard';

/** Permiso de la ficha del cliente (Módulo 2): sin él, el cliente se muestra sin enlace. */
const CUSTOMER_VIEW_PERMISSION = 'clientes.ver';

function byWhen(user: UserRef | null, at: string): string {
  return user ? `${user.displayName} · ${formatDateTime(at)}` : formatDateTime(at);
}

/**
 * Sección 1 · Información general (03 §B.2 #1, §E.4). Lee la ficha ya cargada
 * (sin petición propia). La edición se abre desde la cabecera ("Editar").
 */
export function ProjectGeneralSection({ project }: { project: ProjectDetail }) {
  const canViewCustomer = usePermission(CUSTOMER_VIEW_PERMISSION);

  return (
    <SectionCard title="Información general">
      <Stack spacing={3}>
        <DetailSection number={1} title="Identificación">
          <DetailList
            items={[
              { label: PROJECT_FIELD_LABELS.code, value: project.code },
              { label: PROJECT_FIELD_LABELS.name, value: project.name, wide: true },
              {
                label: PROJECT_FIELD_LABELS.customerId,
                value: canViewCustomer ? (
                  <Link component={RouterLink} to={customerDetailPath(project.customer.id)}>
                    {project.customer.legalName}
                  </Link>
                ) : (
                  project.customer.legalName
                ),
              },
              { label: PROJECT_FIELD_LABELS.ownerId, value: project.owner.displayName },
              { label: 'Estado comercial', value: <CommercialStatusChip status={project.commercialStatus} /> },
              ...(project.duplicatedFrom
                ? [
                    {
                      label: 'Proyecto de origen',
                      value: (
                        <Link component={RouterLink} to={projectDetailPath(project.duplicatedFrom.id)}>
                          {`Proyecto duplicado de ${project.duplicatedFrom.code}`}
                        </Link>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </DetailSection>

        <DetailSection number={2} title="Ubicación">
          <DetailList
            items={[
              { label: PROJECT_FIELD_LABELS.countryId, value: project.country.name },
              { label: PROJECT_FIELD_LABELS.city, value: orDash(project.city) },
              { label: PROJECT_FIELD_LABELS.address, value: orDash(project.address), wide: true },
              { label: PROJECT_FIELD_LABELS.description, value: orDash(project.description), wide: true },
            ]}
          />
        </DetailSection>

        <DetailSection number={3} title="Fechas estimadas">
          <DetailList
            items={[
              { label: PROJECT_FIELD_LABELS.estimatedStartDate, value: formatCalendarDate(project.estimatedStartDate) },
              { label: PROJECT_FIELD_LABELS.estimatedEndDate, value: formatCalendarDate(project.estimatedEndDate) },
              { label: PROJECT_FIELD_LABELS.estimatedDecisionDate, value: formatCalendarDate(project.estimatedDecisionDate) },
            ]}
          />
        </DetailSection>

        <DetailSection number={4} title="Trazabilidad">
          <DetailList
            items={[
              { label: 'Creado', value: byWhen(project.createdBy, project.createdAt) },
              { label: 'Actualizado', value: byWhen(project.updatedBy, project.updatedAt) },
              { label: 'Última actualización', value: formatDateTime(project.lastActivityAt) },
            ]}
          />
        </DetailSection>
      </Stack>
    </SectionCard>
  );
}
