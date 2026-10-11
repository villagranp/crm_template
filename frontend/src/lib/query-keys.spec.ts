import { describe, expect, it } from 'vitest';

import { createScopedQueryKeys } from './query-keys';

describe('createScopedQueryKeys', () => {
  it('anida las claves bajo <ámbito>/<área> para invalidar por prefijo', () => {
    const keys = createScopedQueryKeys('crm', 'customers');

    expect(keys.all).toEqual(['crm', 'customers']);
    expect(keys.list({ page: 2 })).toEqual(['crm', 'customers', 'list', { page: 2 }]);
    expect(keys.detail('c-1')).toEqual(['crm', 'customers', 'detail', 'c-1']);
    expect(keys.list({ page: 2 }).slice(0, keys.lists().length)).toEqual(keys.lists());
    expect(keys.detail('c-1').slice(0, keys.details().length)).toEqual(keys.details());
  });

  it('dos ámbitos con la misma área no comparten claves', () => {
    expect(createScopedQueryKeys('crm', 'catalogs').all).not.toEqual(createScopedQueryKeys('admin', 'catalogs').all);
  });
});
