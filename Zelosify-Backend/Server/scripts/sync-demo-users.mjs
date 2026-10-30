import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient();
try{
 if(process.env.NODE_ENV!=='development')throw new Error('Local development only');
 const base=process.env.KEYCLOAK_URL;
 const r=await fetch(`${base}/realms/master/protocol/openid-connect/token`,{method:'POST',body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:process.env.KEYCLOAK_ADMIN_USERNAME||'admin',password:process.env.KEYCLOAK_ADMIN_PASSWORD})});
 const auth=await r.json();if(!r.ok)throw new Error('Local identity administrator sign-in failed');
 const headers={Authorization:`Bearer ${auth.access_token}`,'content-type':'application/json'};
 const admin=`${base}/admin/realms/${process.env.KEYCLOAK_REALM}`;
 for(const username of ['vendor.demo','manager.demo','vendor.two','manager.two']){
  const user=await db.user.findUniqueOrThrow({where:{username}});
  const existing=await(await fetch(`${admin}/users?username=${encodeURIComponent(username)}&exact=true`,{headers})).json();
  let id=existing[0]?.id;
  if(!id){
   const created=await fetch(`${admin}/users`,{method:'POST',headers,body:JSON.stringify({id:user.externalId,username,email:user.email,firstName:user.firstName,lastName:user.lastName,emailVerified:true,enabled:true,requiredActions:[],credentials:[{type:'password',value:process.env.LOCAL_DEMO_PASSWORD,temporary:false}]})});
   if(!created.ok)throw new Error(`Could not provision ${username}: HTTP ${created.status}`);
   id=created.headers.get('location').split('/').pop();
  }
  if(id!==user.externalId)await db.$transaction([db.user.update({where:{id:user.id},data:{externalId:id}})]);
  const role=await(await fetch(`${admin}/roles/${user.role}`,{headers})).json();
  const assigned=await fetch(`${admin}/users/${id}/role-mappings/realm`,{method:'POST',headers,body:JSON.stringify([role])});
  if(!assigned.ok)throw new Error(`Could not assign local role: HTTP ${assigned.status}`);
 }
 console.log('Four local demo users synchronized with Keycloak; no credentials displayed.');
}finally{await db.$disconnect();}
