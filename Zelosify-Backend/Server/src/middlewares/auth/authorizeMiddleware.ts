import type { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/typeIndex.js';
import { isValidRole } from '../../utils/RBAC/isValidRole.js';

// Authentication verifies the token and loads the current database role first.
export function authorizeRole(requiredRole: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!isValidRole(requiredRole)) {
      res.status(500).json({message:'Invalid role configuration'});
      return;
    }
    if (!req.user) {
      res.status(401).json({message:'Authentication required'});
      return;
    }
    if (req.user.role !== requiredRole) {
      res.status(403).json({message:'Access denied'});
      return;
    }
    next();
  };
}
