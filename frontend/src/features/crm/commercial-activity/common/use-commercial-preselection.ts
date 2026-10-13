import { useMemo } from 'react';

import { CRM_MODULE_OPTION_KEYS, useModuleAvailability } from '@/features/crm/common/use-module-availability';
import { ApiError } from '@/services/api/api-error';

import { LOOKUP_MAX_PAGE_SIZE, useCustomerLookup, useCustomerProjectsLookup, useOpenOpportunities } from './commercial-activity.queries';
import { EMPTY_COMMERCIAL_LINK, type CommercialLinkValue, type CommercialPreselectionIds } from './commercial-link';

export interface CommercialPreselection {
  /** Todavía se están resolviendo los ids: el formulario debe esperar para fijar sus valores iniciales. */
  isResolving: boolean;
  /** Vínculo resuelto; lo que no se pudo resolver queda vacío (AC-04.49). */
  value: CommercialLinkValue;
  /** Avisos de lo que no se preseleccionó, para mostrarlos sobre el formulario. */
  problems: string[];
}

const PROJECTS_QUERY = { page: 1, pageSize: LOOKUP_MAX_PAGE_SIZE };

function notFoundOr(error: unknown, notFound: string, other: string): string {
  return error instanceof ApiError && error.isNotFound ? notFound : other;
}

/**
 * Resuelve la preselección de una ficha (04 §E.10, F-31): con `customerId` el
 * cliente; con `projectId` el proyecto (entre los de ese cliente); con
 * `opportunityId` la oportunidad abierta (entre las del proyecto). Lo que no
 * existe, no es visible o no encaja se deja vacío y se informa; el backend
 * vuelve a validar todo al guardar (RN-04.23).
 *
 * El Módulo 3 puede no estar entregado: sin su opción de menú no se llama a
 * `/projects` (D-02.10) y se avisa de que el proyecto no se preseleccionó; si su
 * API falla, igual.
 */
export function useCommercialPreselection(ids: CommercialPreselectionIds): CommercialPreselection {
  const customerId = ids.customerId || undefined;
  const projectId = ids.projectId || undefined;
  const opportunityId = ids.opportunityId || undefined;
  const projectsModule = useModuleAvailability(CRM_MODULE_OPTION_KEYS.projects);

  const customer = useCustomerLookup(customerId);
  const wantsProject = Boolean(projectId) && Boolean(customerId) && customer.isSuccess;
  const projects = useCustomerProjectsLookup(customerId ?? null, PROJECTS_QUERY, wantsProject && projectsModule.isAvailable);
  const project = projects.data?.data.find((item) => item.id === projectId) ?? null;
  const opportunities = useOpenOpportunities(project?.id ?? null, Boolean(opportunityId) && project !== null);

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
      } else if (projects.isPending) {
        isResolving = true;
      } else if (projects.isError) {
        problems.push('No se pudieron cargar los proyectos del cliente: no se preseleccionó el proyecto.');
      } else if (!project) {
        problems.push('El proyecto indicado no existe, no es de este cliente o no tienes acceso.');
      } else {
        value.project = { id: project.id, code: project.code, name: project.name };
      }
    }

    if (opportunityId && !isResolving) {
      if (!value.project) {
        problems.push('No se preseleccionó la oportunidad porque falta su proyecto.');
      } else if (opportunities.isPending) {
        isResolving = true;
      } else if (opportunities.isError) {
        problems.push('No se pudieron cargar las oportunidades del proyecto: no se preseleccionó la oportunidad.');
      } else {
        const match = opportunities.data.data.find((item) => item.id === opportunityId);
        if (match) {
          value.opportunity = { id: match.id, code: match.code };
        } else {
          problems.push('La oportunidad indicada no existe, no está abierta o no es de este proyecto.');
        }
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
    projects.isPending,
    projects.isError,
    project,
    opportunities.isPending,
    opportunities.isError,
    opportunities.data,
  ]);
}
