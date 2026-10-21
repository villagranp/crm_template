import { Injectable } from '@nestjs/common';

import type {
  CutoverAccount,
  LocalCredentialRevocation,
  RevocationResult,
} from '@/modules/identity-cutover/ports/local-credential-revocation.port';

import { PrismaService } from '../prisma.service';

/** Motivo que queda en `user_sessions.revoked_reason` al retirar la autenticación local (ADR-027). */
export const LOCAL_AUTH_RETIRED_REASON = 'local_auth_retired';

/** Adaptador Prisma del corte a Entra ID (ADR-027). Lee con un solo `findMany` y escribe en una transacción. */
@Injectable()
export class PrismaLocalCredentialRevocationRepository implements LocalCredentialRevocation {
  constructor(private readonly prisma: PrismaService) {}

  async listAccounts(now: Date): Promise<CutoverAccount[]> {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        status: true,
        deletedAt: true,
        credential: { select: { id: true } },
        identities: { where: { provider: 'ENTRA_ID' }, select: { id: true }, take: 1 },
        _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: now } } } } },
      },
      orderBy: { id: 'asc' },
    });

    return users.map((user) => ({
      userId: user.id,
      status: user.status,
      deleted: user.deletedAt !== null,
      linked: user.identities.length > 0,
      hasCredential: user.credential !== null,
      activeSessions: user._count.sessions,
    }));
  }

  async revoke(userIds: readonly string[], now: Date): Promise<RevocationResult> {
    if (userIds.length === 0) {
      return { credentialsDeleted: 0, sessionsRevoked: 0 };
    }
    const ids = [...userIds];
    const [credentials, sessions] = await this.prisma.$transaction([
      this.prisma.userCredential.deleteMany({ where: { userId: { in: ids } } }),
      this.prisma.userSession.updateMany({
        where: { userId: { in: ids }, revokedAt: null },
        data: { revokedAt: now, revokedReason: LOCAL_AUTH_RETIRED_REASON },
      }),
    ]);
    return { credentialsDeleted: credentials.count, sessionsRevoked: sessions.count };
  }
}
