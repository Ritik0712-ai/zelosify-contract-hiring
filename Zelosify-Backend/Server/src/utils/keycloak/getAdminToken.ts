import axios from "axios";

export async function getAdminToken() {
  try {
    console.log(JSON.stringify({event:'auth.admin_token.requested'}));
    const response = await axios.post(
      `${process.env.KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: process.env.KEYCLOAK_ADMIN || "admin",
        password: process.env.KEYCLOAK_ADMIN_PASSWORD || "admin",
        scope: "openid",
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    console.log(JSON.stringify({event:'auth.admin_token.received'}));
    return response.data.access_token;
  } catch (error) {
    console.error(JSON.stringify({event:'auth.admin_token.failed'}));
    throw error;
  }
}
