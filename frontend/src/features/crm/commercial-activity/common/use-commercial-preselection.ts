import { useMemo } from 'react';

import { CRM_MODULE_OPTION_KEYS, useModuleAvailability } from '@/features/crm/common/use-module-availability';
import { useOpportunity } from '@/features/crm/opportunities';
import { useProject } from '@/features/crm/projects';
import { ApiError } from '@/services/api/api-error';

import { useCustomerLookup } from './commercial-activity.queries';
import { EMPTY_COMMERCIAL_LINK, type CommercialLinkValue, type CommercialPreselectionIds } from './commercial-link';

export interface CommercialPreselection {
  /** Todavía se están resolviendo los ids: el formulario debe esperar para fijar sus valores iniciales. */
  isResolving: boolean;
  /** Vínculo resuelto; lo que no se pudo resolver queda vacío (AC-04.49). */
  value: CommercialLinkValue;
  /** Avisos de lo que no se preseleccionó, para mostrarlos sobre el formulario. */
  problems: string[];
}

function notFoundOr(error: unknown, notFound: string, other: string): string {
  return error instanceof ApiError && error.isNotFound ? notFound : other;
}

const PROJECT_MISMATCH = 'El proyecto indicado no existe, no es de este cliente o no tienes acceso.';
const OPPORTUNITY_MISMATCH = 'La oportunidad indicada no existe, no está abierta o no es de este proyecto.';

/**
 * Resuelve la preselección de una ficha (04 §E.10, F-31): con `customerId` el
 * cliente (`GET /customers/{id}`, 02); con `projectId` el proyecto
 * (`GET /projects/{id}`, `useProject` del barril de 03), que debe ser de ese
 * cliente; con `opportunityId` la oportunidad (`GET /opportunities/{id}`,
 * `useOpportunity` del barril de 03), que debe ser del proyecto y estar abierta.
 * Lo que no existe, no es visible o no encaja se deja vacío y se informa; el
 * backend vuelve a validar todo al guardar (RN-04.23).
 *
 * Sin la opción de menú de Proyectos (D-02.10) no se llama a `/projects` y se
 * avisa de que el proyecto no se preseleccionó.
 */
export function useCommercialPreselection(ids: CommercialPreselectionIds): CommercialPreselection {
  const customerId = ids.customerId || undefined;
  const projectId = ids.projectId || undefined;
  const opportunityId = ids.opportunityId || undefined;
  const projectsModule = useModuleAvailability(CRM_MODULE_OPTION_KEYS.projects);

  const customer = useCustomerLookup(customerId);
  const wantsProject = Boolean(projectId) && customer.isSuccess && projectsModule.isAvailable;
  const project = useProject(wantsProject ? projectId : undefined);
  const projectMatches = project.isSuccess && project.data.customer.id === customerId;
  const opportunity = useOpportunity(opportunityId && projectMatches ? opportunityId : undefined);

  return useMemo<CommercialPreselection>(() => {
    const problems: string[] = [];
    let isResolving = false;
    const value: CommercialLinkValue = { ...EMPTY_COMMERCIAL_LINK };

    if (customerId) {
      if (customer.isPending) {
        isResolving = true;
      } else if (customer.isError) {
        problems.push(
          notFoundOr(
            customer.error,
            'El cliente indicado no existe o no tienes acceso. Elígelo de la lista.',
            'No se pudo comprobar el cliente indicado. Elígelo de la lista.',
          ),
        );
      } else {
        value.customer = {
          id: customer.data.id,
          crmCode: customer.data.crmCode,
          legalName: customer.data.legalName,
          countryId: customer.data.country.id,
        };
      }
    }

    if (projectId && !isResolving) {
      if (!value.customer) {
        problems.push('No se preseleccionó el proyecto porque falta su cliente.');
      } else if (projectsModule.isLoading) {
        isResolving = true;
      } else if (!projectsModule.isAvailable) {
        problems.push('El módulo de Proyectos no está disponible: no se preseleccionó el proyecto.');
      } else if (project.isPending) {
        isResolving = true;
      } else if (project.isError) {
        problems.push(notFoundOr(project.error, PROJECT_MISMATCH, 'No se pudo comprobar el proyecto indicado: no se preseleccionó.'));
      } else if (!projectMatches) {
        problems.push(PROJECT_MISMATCH);
      } else {
        value.project = { id: project.data.id, code: project.data.code, name: project.data.name };
      }
    }

    if (opportunityId && !isResolving) {
      if (!value.project) {
        problems.push('No se preseleccionó la oportunidad porque falta su proyecto.');
      } else if (opportunity.isPending) {
        isResolving = true;
      } else if (opportunity.isError) {
        problems.push(notFoundOr(opportunity.error, OPPORTUNITY_MISMATCH, 'No se pudo comprobar la oportunidad indicada: no se preseleccionó.'));
      } else if (opportunity.data.project.id !== value.project.id || opportunity.data.stage.isClosed) {
        problems.push(OPPORTUNITY_MISMATCH);
      } else {
        value.opportunity = { id: opportunity.data.id, code: opportunity.data.code };
      }
    }

    return { isResolving, value, problems };
  }, [
    customerId,
    projectId,
    opportunityId,
    customer.isPending,
    customer.isError,
    customer.error,
    customer.data,
    projectsModule.isLoading,
    projectsModule.isAvailable,
    project.isPending,
    project.isError,
    project.error,
    project.data,
    projectMatches,
    opportunity.isPending,
    opportunity.isError,
    opportunity.error,
    opportunity.data,
  ]);
}
