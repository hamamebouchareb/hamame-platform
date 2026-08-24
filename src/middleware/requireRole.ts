import { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";

// Must run AFTER requireAuth (src/middleware/auth.ts) — it trusts req.auth.userId is
// already populated and verified, and never re-checks the JWT itself.
//
// Grants access if the user has ANY of the listed role names (PRD Section 6 additive
// roles — prisma/schema.prisma's Role/UserRole). Responds 403 FORBIDDEN otherwise,
// naming only the role(s) required — never the user's actual roles, to avoid leaking
// that information to a caller who doesn't have them.
export function requireRole(...roleNames: string[]) {
  return async function (req: Request, _res: Response, next: NextFunction) {
    try {
      const userId = req.auth!.userId;

      const userRoles = await prisma.userRole.findMany({
        where: { userId },
        include: { role: { select: { name: true } } },
      });
      const userRoleNames = new Set(userRoles.map((userRole) => userRole.role.name));

      const hasRequiredRole = roleNames.some((roleName) => userRoleNames.has(roleName));
      if (!hasRequiredRole) {
        return next(
          new ApiError(
            403,
            "FORBIDDEN",
            `This action requires one of the following roles: ${roleNames.join(", ")}`
          )
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
