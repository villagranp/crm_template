import { Alert, Card, CardContent, Stack } from '@mui/material';

import { DetailList, DetailSection } from '@/components/data';

import { CUSTOMER_FIELD_LABELS, formatDateTime, orDash, sourceImportLabel, taxIdLabelOf } from '../customer-format';
import type { Customer } from '../customers.api';

import { CustomerStatusChip } from './CustomerStatusChip';

function byWhen(user: { displayName: string } | null, at: string): string {
  return user ? `${user.displayName} · ${formatDateTime(at)}` : formatDateTime(at);
}

/** Datos generales, comerciales y trazabilidad de la ficha (02 §E.4). */
export function CustomerGeneralSection({ customer }: { customer: Customer }) {
  const source = sourceImportLabel(customer);

  return (
    <Card component="section" aria-label="Información general">
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2}>
          {customer.access === 'INHERITED' ? (
            <Alert severity="info">Lo ves porque participas en un proyecto de este cliente. Es de solo lectura.</Alert>
          ) : null}

          <DetailSection number={1} title="Identificación">
            <DetailList
              items={[
                { label: CUSTOMER_FIELD_LABELS.crmCode, value: customer.crmCode },
                { label: CUSTOMER_FIELD_LABELS.customerCode, value: orDash(customer.customerCode) },
                { label: CUSTOMER_FIELD_LABELS.legalName, value: customer.legalName, wide: true },
                { label: CUSTOMER_FIELD_LABELS.tradeName, value: orDash(customer.tradeName) },
                { label: taxIdLabelOf(customer.country), value: orDash(customer.taxId) },
              ]}
            />
          </DetailSection>

          <DetailSection number={2} title="Ubicación y contacto">
            <DetailList
              items={[
                { label: CUSTOMER_FIELD_LABELS.countryId, value: customer.country.name },
                { label: CUSTOMER_FIELD_LABELS.city, value: orDash(customer.city) },
                { label: CUSTOMER_FIELD_LABELS.address, value: orDash(customer.address), wide: true },
                { label: CUSTOMER_FIELD_LABELS.phone, value: orDash(customer.phone) },
                { label: CUSTOMER_FIELD_LABELS.email, value: orDash(customer.email) },
                ...(customer.primaryContact ? [{ label: 'Contacto principal', value: customer.primaryContact.fullName }] : []),
              ]}
            />
          </DetailSection>

          <DetailSection number={3} title="Clasificación comercial">
            <DetailList
              items={[
                { label: CUSTOMER_FIELD_LABELS.companyTypeId, value: orDash(customer.companyType?.label) },
                {
                  label: CUSTOMER_FIELD_LABELS.statusId,
                  value: <CustomerStatusChip label={customer.status.label} isActive={customer.status.isActive} />,
                },
                { label: CUSTOMER_FIELD_LABELS.ratingId, value: orDash(customer.rating?.label) },
                {
                  label: CUSTOMER_FIELD_LABELS.salesOwnerId,
                  value: customer.salesOwner.isActive ? customer.salesOwner.displayName : `${customer.salesOwner.displayName} (inactivo)`,
                },
              ]}
            />
          </DetailSection>

          <DetailSection number={4} title="Trazabilidad">
            <DetailList
              items={[
                { label: 'Creado', value: byWhen(customer.createdBy, customer.createdAt) },
                { label: 'Actualizado', value: byWhen(customer.updatedBy, customer.updatedAt) },
                ...(source ? [{ label: 'Origen', value: source }] : []),
                ...(customer.isDeleted ? [{ label: 'Eliminado', value: formatDateTime(customer.deletedAt) }] : []),
              ]}
            />
          </DetailSection>
        </Stack>
      </CardContent>
    </Card>
  );
}
