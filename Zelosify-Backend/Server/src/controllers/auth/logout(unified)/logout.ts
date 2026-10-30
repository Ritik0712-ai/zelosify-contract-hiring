import { Response } from "express";
import { AuthenticatedRequest } from "../../../types/common.js";
import asyncHandler from "../../../utils/handler/asyncHandler.js";
import { getKeycloakClientSecret } from "../../../utils/keycloak/getKeycloakClientSecret.js";
import axios from "axios";

export const logout = asyncHandler(
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // Retrieve refresh token from cookies or header.
      const refreshToken =
        req.cookies.refresh_token || req.headers.authorization?.split(" ")[1];
      if (!refreshToken) {
        console.log(JSON.stringify({event:'auth.logout.no_session'}));
        res
          .status(400)
          .json({ message: "No refresh token found, already logged out" });
        return;
      }
      // Assuming that authentication middleware attaches req.user:
      // Use type assertion to access req.user
      const user = (req as any).user;
      console.log(JSON.stringify({event:'auth.logout.started'}));

      // Check if this is a Keycloak user or OAuth user.
      if (user && user.provider === "KEYCLOAK") {
        // For Keycloak users, retrieve the client secret and call Keycloak logout endpoint.
        const clientSecret = await getKeycloakClientSecret();
        if (!clientSecret) {
          console.error(JSON.stringify({event:'auth.configuration.failed'}));
          res.status(500).json({ message: "Failed to retrieve CLIENT_SECRET" });
          return;
        }
        try {
          await axios.post(
            `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/logout`,
            new URLSearchParams({
              client_id: process.env.KEYCLOAK_CLIENT_ID!,
              client_secret: clientSecret,
              refresh_token: refreshToken,
            }),
            { timeout:10000, headers: { "Content-Type": "application/x-www-form-urlencoded" } }
          );
          console.log(JSON.stringify({event:'auth.session.revoked'}));
        } catch (error: any) {
          // Type as 'any' for axios error
          console.warn(JSON.stringify({event:'auth.session.revoke.failed'}));
          res.status(500).json({ message: "Error logging out of Keycloak" });
          return;
        }
      } else {
        // For OAuth users (Google/Microsoft), you may not need to call an external logout endpoint.
        console.log(JSON.stringify({event:'auth.local_session.clear'}));
      }

      // Clear cookies securely
      res.clearCookie("access_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });
      res.clearCookie("refresh_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });
      console.log(JSON.stringify({event:'auth.logout.completed'}));

      res.status(200).json({ message: "Logged out successfully" });
      return;
    } catch (error) {
      console.error(JSON.stringify({event:'auth.logout.failed'}));
      res.status(500).json({ message: "Error logging out" });
      return;
    }
  }
);
