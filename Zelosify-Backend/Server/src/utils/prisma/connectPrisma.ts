import prisma from "../../config/prisma/prisma.js";

export default async function connectPrisma() {
  try {
    await prisma.$connect();
    console.log(JSON.stringify({event:'database.connected'}));
  } catch (error) {
    console.error(JSON.stringify({event:'database.connection.failed'}));
    process.exit(1);
  }
}
