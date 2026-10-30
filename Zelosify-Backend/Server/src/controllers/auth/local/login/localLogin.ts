import axios from "axios";
import { Request, Response } from "express";
import prisma from "../../../../config/prisma/prisma.js";
import { getKeycloakClientSecret } from "../../../../utils/keycloak/getKeycloakClientSecret.js";
import { generateTempToken } from "../../../../utils/jwt/generateTempToken.js";

export const verifyLogin = async (
  req: Request<{}, any, { usernameOrEmail: string; password: string }>,
  res: Response
): Promise<void> => {
  const { usernameOrEmail, password } = req.body;
  if (!usernameOrEmail || !password) {
    res.status(400).json({ message: "Username/Email and password are required" });
    return;
  }
  try {
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: usernameOrEmail }, { username: usernameOrEmail }] },
      select: {id:true,username:true,email:true,firstName:true,lastName:true,phoneNumber:true,
        role:true,department:true,provider:true,tenantId:true,totpSecret:true,
        tenant:{select:{tenantId:true,companyName:true}}},
    });
    if (!user || user.provider !== 'KEYCLOAK') {
      res.status(401).json({message:'Invalid credentials'});
      return;
    }
    let tokens;
    try {
      const clientSecret = await getKeycloakClientSecret();
      const response = await axios.post(
        `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`,
        new URLSearchParams({grant_type:'password',client_id:process.env.KEYCLOAK_CLIENT_ID!,
          client_secret:clientSecret,username:user.email,password}),
        {headers:{'Content-Type':'application/x-www-form-urlencoded'},timeout:10000}
      );
      tokens=response.data;
    } catch {
      res.status(401).json({message:'Invalid credentials'});
      return;
    }
    // Two-factor authentication depends on enrollment, never on a username pattern.
    if (user.totpSecret) {
      res.cookie('temp_token', generateTempToken(user.id,tokens.refresh_token), {
        httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge:300000,path:'/',
      });
      res.json({message:'Login verified. Please enter your TOTP code.'});
      return;
    }
    const cookieOptions = {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/'};
    res.cookie('access_token',tokens.access_token,{...cookieOptions,maxAge:tokens.expires_in*1000});
    res.cookie('refresh_token',tokens.refresh_token,{...cookieOptions,maxAge:tokens.refresh_expires_in*1000});
    const {totpSecret,...publicUser}=user;
    res.json({success:true,message:'Authentication successful',user:publicUser,redirectTo:'/user'});
  } catch {
    res.status(500).json({message:'Authentication service unavailable'});
  }
};
