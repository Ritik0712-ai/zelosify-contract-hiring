import axios from 'axios';
import { getKeycloakClientSecret } from '../../utils/keycloak/getKeycloakClientSecret.js';

// Protected API routes use authenticateUser's JWKS signature and issuer checks.
// The legacy session adapter is unnecessary for this cookie/token API.
export async function setupKeycloakConfig(): Promise<void> {
  const url=process.env.KEYCLOAK_URL || 'http://localhost:8080/auth';
  const realm=process.env.KEYCLOAK_REALM || 'Zelosify';
  await axios.get(`${url}/realms/${realm}/.well-known/openid-configuration`,{timeout:10000});
  console.log(JSON.stringify({event:'keycloak.connected',realm}));
}

// Preserve the registration helper's interface while using configured credentials.
export async function getClientSecret(_adminToken: string): Promise<string> {
  return getKeycloakClientSecret();
}
