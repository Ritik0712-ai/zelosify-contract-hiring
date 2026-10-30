import 'dotenv/config';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {authenticator} from 'otplib';
assert.equal(process.env.NODE_ENV,'development','Run only against the local development setup');
const base=`http://localhost:${process.env.PORT||5050}/api/v1`;
async function login(username,password=process.env.LOCAL_DEMO_PASSWORD){
 const r=await fetch(`${base}/auth/verify-login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({usernameOrEmail:username,password})});
 return {response:r,data:await r.json(),cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
}
assert.equal((await fetch(`${base}/auth/user`)).status,401);
assert.equal((await fetch(`${base}/auth/user`,{headers:{authorization:'Bearer invalid-token'}})).status,401);
assert.equal((await login('vendor.demo','invalid-password')).response.status,401);
const checks=[];
for(const [username,role] of [['vendor.demo','IT_VENDOR'],['manager.demo','HIRING_MANAGER']]){
 const {response,data,cookie}=await login(username);
 assert.equal(response.status,200,`Login failed for ${role}: ${data.message}`);
 assert.equal(data.user.role,role);
 const user=await fetch(`${base}/auth/user`,{headers:{cookie}});
 assert.equal(user.status,200);
 assert.equal((await user.json()).role,role);
 const manager=await fetch(`${base}/hiring-manager`,{headers:{cookie}});
 assert.equal(manager.status,role==='HIRING_MANAGER'?200:403);
 const logout=await fetch(`${base}/auth/logout`,{method:'POST',headers:{cookie}});
 assert.equal(logout.status,200);
 checks.push({role,login:true,session:true,managerRoute:manager.status,logout:true});
}
// Ensure enrolled users cannot skip the second factor, using the disposable demo user.
const prisma=new PrismaClient();
const enrolled=await prisma.user.findUniqueOrThrow({where:{username:'vendor.demo'}});
assert.equal(enrolled.tenantId,'bruce-wayne-corp');
try {
 const secret=authenticator.generateSecret();
 await prisma.$transaction([prisma.user.update({where:{id:enrolled.id},data:{totpSecret:secret}})]);
 const pending=await login('vendor.demo');
 assert.equal(pending.response.status,200);
 assert.equal(pending.data.user,undefined);
 assert.equal(pending.cookie.includes('access_token='),false);
 const denied=await fetch(`${base}/auth/verify-totp`,{method:'POST',headers:{'content-type':'application/json',cookie:pending.cookie},body:JSON.stringify({totp:'invalid'})});
 assert.equal(denied.status,401);
 const verified=await fetch(`${base}/auth/verify-totp`,{method:'POST',headers:{'content-type':'application/json',cookie:pending.cookie},body:JSON.stringify({totp:authenticator.generate(secret)})});
 assert.equal(verified.status,200);
} finally {
 await prisma.$transaction([prisma.user.update({where:{id:enrolled.id},data:{totpSecret:enrolled.totpSecret}})]);
 await prisma.$disconnect();
}
const session=await login('vendor.demo');
const refreshOnly=session.cookie.split('; ').filter(c=>c.startsWith('refresh_token=')).join('; ');
const renewed=await fetch(`${base}/auth/refresh`,{method:'POST',headers:{cookie:refreshOnly}});
assert.equal(renewed.status,200);
const renewedCookie=renewed.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
assert.equal((await fetch(`${base}/auth/user`,{headers:{cookie:renewedCookie}})).status,200);
assert.equal((await fetch(`${base}/auth/refresh`,{method:'POST',headers:{cookie:'refresh_token=invalid'}})).status,401);
console.log(JSON.stringify({checks,anonymousAccessDenied:true,malformedTokenDenied:true,wrongPasswordDenied:true,enrolledSecondFactorVerified:true,sessionRenewalVerified:true},null,2));
