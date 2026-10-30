// src/routers/auth/normalAuthRoutes.ts
import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import asyncHandler from "../../../utils/handler/asyncHandler.js";
import { authenticateUser } from "../../../middlewares/auth/authenticateMiddleware.js";
import {logout} from '../../../controllers/auth/logout(unified)/logout.js';
import {register,verifyLogin,verifyTOTP} from '../../../controllers/auth/local/localAuthController.js';
import { AuthenticatedRequest } from "../../../types/common.js";
import axios from "axios";
import { getKeycloakClientSecret } from "../../../utils/keycloak/getKeycloakClientSecret.js";

/**
 * Wraps async handlers to ensure void return type
 * @param handler - The request handler to wrap
 * @returns Wrapped RequestHandler with proper error handling
 */
const wrapHandler = (handler: RequestHandler): RequestHandler =>
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    await handler(req, res, next);
  });

/**
 * Wraps async handlers for middleware-protected routes
 * @param handler - The request handler to wrap
 * @returns Wrapped RequestHandler with proper error handling
 */
const wrapProtectedHandler = (handler: RequestHandler): RequestHandler =>
  asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      await handler(req, res, next);
    }
  );

const router = Router();

router.post('/refresh', async (req: Request, res: Response) => {
  const options={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/'};
  const origin=req.headers.origin;
  if(origin&&!['http://localhost:5173','http://127.0.0.1:5173'].includes(origin)){res.status(403).json({message:'Untrusted request origin.'});return;}
  if(typeof req.cookies.refresh_token!=='string'){res.status(401).json({message:'Sign in to continue.'});return;}
  try {
    const secret=await getKeycloakClientSecret();
    const {data}=await axios.post(`${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`,new URLSearchParams({grant_type:'refresh_token',client_id:process.env.KEYCLOAK_CLIENT_ID!,client_secret:secret,refresh_token:req.cookies.refresh_token}),{timeout:10000});
    res.cookie('access_token',data.access_token,{...options,maxAge:data.expires_in*1000});
    res.cookie('refresh_token',data.refresh_token,{...options,maxAge:data.refresh_expires_in*1000});
    res.json({success:true});
  } catch {
    res.clearCookie('access_token',options);res.clearCookie('refresh_token',options);
    res.status(401).json({message:'Your session expired. Sign in again.'});
  }
});

/**
 * =============================================================================
 * LOCAL AUTHENTICATION ROUTES
 * =============================================================================
 */

/**
 * POST /register - Register new user account
 * Creates a new user account with provided credentials
 */
// Contract-workspace membership must be provisioned, never selected by a caller.
router.post("/register", (_req, res) => {
  res.status(403).json({message:"User access is provisioned by your organization. Contact your administrator."});
});

/**
 * POST /verify-login - Verify user login credentials
 * Validates user credentials and initiates login process
 */
router.post("/verify-login", wrapHandler(verifyLogin));

/**
 * POST /verify-totp - Verify TOTP for two-factor authentication
 * Validates TOTP code for users with 2FA enabled
 */
router.post("/verify-totp", wrapHandler(verifyTOTP));

/**
 * POST /logout - Logout authenticated user
 * Requires authentication middleware to access user session
 */
router.post("/logout", authenticateUser, wrapProtectedHandler(logout));

export default router;
