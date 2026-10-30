import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
const prisma=new PrismaClient();
try {
 await prisma.$transaction(async tx=>{
  const tenantId='bruce-wayne-corp';
  await tx.tenants.upsert({where:{tenantId},update:{},create:{tenantId,companyName:'Bruce Wayne Corp'}});
  for(const [index,role,username,email,lastName] of [[1,'IT_VENDOR','vendor.demo','vendor@example.test','Vendor'],[2,'HIRING_MANAGER','manager.demo','manager@example.test','Manager']]){
   const externalId=`10000000-0000-4000-8000-00000000000${index}`;
   const data={username,email,firstName:'Demo',lastName,role,tenantId,provider:'KEYCLOAK',profileComplete:true};
   await tx.user.upsert({where:{externalId},update:data,create:{externalId,...data}});
  }
 });
 console.log('Local tenant and two role-specific demo users seeded.');
}finally{await prisma.$disconnect();}
