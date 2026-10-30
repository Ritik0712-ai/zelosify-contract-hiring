import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {spawnSync} from 'node:child_process';
const databaseUrl=new URL(process.env.DATABASE_URL||'');
if(databaseUrl.hostname!=='localhost'||process.env.NODE_ENV!=='development')throw new Error('Local test provisioning requires the localhost development database.');
const db=new PrismaClient();
try{
 const existing=await db.$queryRaw`SELECT datname FROM pg_database WHERE datname = 'zelosify_test'`;
 // PostgreSQL requires CREATE DATABASE outside a transaction; this is local test infrastructure, not application data.
 if(!existing.length)await db.$executeRawUnsafe('CREATE DATABASE zelosify_test');
}finally{await db.$disconnect();}
databaseUrl.pathname='/zelosify_test';
const env={...process.env,DATABASE_URL:databaseUrl.toString(),NODE_ENV:'test',AI_WORKER_ENABLED:'false'};
for(const args of [['prisma','migrate','deploy'],['vitest','--config','vitest.config.ts','--run',...process.argv.slice(2)]]){
 const result=spawnSync('npx',args,{env,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
