import { Readable } from 'node:stream';

import { BadRequestException, type ExecutionContext } from '@nestjs/common';

import { PermissionDeniedError, ResourceNotFoundError } from '@/common/errors/application-error';

import type { CustomerActorResolver } from './customer-actor.resolver';
import { CustomerAttachmentWriteGuard } from './customer-attachment-write.guard';
import type { CustomersService } from './customers.service';
import { makeActor } from './testing/customer-fixtures';

const CUSTOMER_ID = '7b1f0c3e-2a4d-4e8f-9b6a-1c2d3e4f5a6b';

function contextFor(params: Record<string, string>, request: object = { readableEnded: true }): ExecutionContext {
  const withParams = Object.assign(request, { params });
  return { switchToHttp: () => ({ getRequest: () => withParams }) } as unknown as ExecutionContext;
}

describe('CustomerAttachmentWriteGuard (autoriza antes de leer el multipart)', () => {
  const actor = makeActor(['clientes.ver', 'clientes.editar']);
  let customers: { assertCanManageAttachments: jest.Mock };
  let actors: { fromRequest: jest.Mock };
  let guard: CustomerAttachmentWriteGuard;

  beforeEach(() => {
    customers = { assertCanManageAttachments: jest.fn().mockResolvedValue(undefined) };
    actors = { fromRequest: jest.fn().mockResolvedValue(actor) };
    guard = new CustomerAttachmentWriteGuard(customers as unknown as CustomersService, actors as unknown as CustomerActorResolver);
  });

  it('deja pasar si el actor puede editar el cliente de la ruta', async () => {
    await expect(guard.canActivate(contextFor({ customerId: CUSTOMER_ID }))).resolves.toBe(true);
    expect(customers.assertCanManageAttachments).toHaveBeenCalledWith(actor, CUSTOMER_ID);
  });

  it('propaga el 404 de un cliente fuera de alcance y el 403 de uno no editable', async () => {
    customers.assertCanManageAttachments.mockRejectedValueOnce(new ResourceNotFoundError('Customer', CUSTOMER_ID));
    await expect(guard.canActivate(contextFor({ customerId: CUSTOMER_ID }))).rejects.toBeInstanceOf(ResourceNotFoundError);

    customers.assertCanManageAttachments.mockRejectedValueOnce(new PermissionDeniedError('clientes.administrar'));
    await expect(guard.canActivate(contextFor({ customerId: CUSTOMER_ID }))).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('un customerId que no es UUID es 400 sin consultar nada', async () => {
    await expect(guard.canActivate(contextFor({ customerId: 'no-es-uuid' }))).rejects.toBeInstanceOf(BadRequestException);
    expect(actors.fromRequest).not.toHaveBeenCalled();
    expect(customers.assertCanManageAttachments).not.toHaveBeenCalled();
  });

  it('al denegar, descarta el cuerpo pendiente sin almacenarlo antes de responder', async () => {
    customers.assertCanManageAttachments.mockRejectedValueOnce(new ResourceNotFoundError('Customer', CUSTOMER_ID));
    const body = Readable.from([Buffer.alloc(1024), Buffer.alloc(1024)]);

    await expect(guard.canActivate(contextFor({ customerId: CUSTOMER_ID }, body))).rejects.toBeInstanceOf(ResourceNotFoundError);
    expect(body.readableEnded).toBe(true);
  });
});
