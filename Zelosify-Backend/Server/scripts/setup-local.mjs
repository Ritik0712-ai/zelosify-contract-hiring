import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
const env = fs.existsSync('.env') ? dotenv.parse(fs.readFileSync('.env')) : {};
const defaults = {
  NODE_ENV:'development', PORT:'5050',
  KEYCLOAK_URL:'http://localhost:8080/auth', KEYCLOAK_REALM:'Zelosify',
  KEYCLOAK_CLIENT_ID:'zelosify-local', KEYCLOAK_ADMIN_USERNAME:'admin', KEYCLOAK_ADMIN:'admin',
  AWS_PROFILE:'zelosify', AWS_REGION:'ap-southeast-2', S3_AWS_REGION:'ap-southeast-2',
  STORAGE_PROVIDER:'aws', ENCRYPTION_ALGORITHM:'aes-256-gcm', GEMINI_MODEL:'gemini-3.1-flash-lite',
  AI_WORKER_ENABLED:'true', AI_PROCESSING_TIMEOUT_MS:'60000', GEMINI_MIN_REQUEST_INTERVAL_MS:'6000',
};
for (const [k,v] of Object.entries(defaults)) env[k] ||= v;
env.AWS_REGION = env.S3_AWS_REGION = 'ap-southeast-2';
for (const k of ['LOCAL_DATABASE_PASSWORD','KEYCLOAK_ADMIN_PASSWORD','KEYCLOAK_CLIENT_SECRET','JWT_SECRET','SESSION_SECRET','LOCAL_DEMO_PASSWORD']) env[k] ||= crypto.randomBytes(24).toString('hex');
env.ENCRYPTION_KEY ||= crypto.randomBytes(32).toString('hex');
env.DATABASE_URL ||= `postgresql://zelosify:${env.LOCAL_DATABASE_PASSWORD}@localhost:5445/zelosify?schema=public`;
fs.writeFileSync('.env','# Private local configuration. Never commit.\n'+Object.entries(env).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});
fs.chmodSync('.env',0o600);
fs.mkdirSync('.local/realms',{recursive:true});
const users=[
 {id:'10000000-0000-4000-8000-000000000001',username:'vendor.demo',email:'vendor@example.test',firstName:'Demo',lastName:'Vendor',role:'IT_VENDOR'},
 {id:'10000000-0000-4000-8000-000000000002',username:'manager.demo',email:'manager@example.test',firstName:'Demo',lastName:'Manager',role:'HIRING_MANAGER'},
];
const realm={realm:env.KEYCLOAK_REALM,enabled:true,sslRequired:'none',registrationAllowed:false,
 roles:{realm:users.map(u=>({name:u.role}))},
 clients:[{clientId:env.KEYCLOAK_CLIENT_ID,secret:env.KEYCLOAK_CLIENT_SECRET,enabled:true,publicClient:false,directAccessGrantsEnabled:true,standardFlowEnabled:true,fullScopeAllowed:true,defaultClientScopes:['basic','profile','email','roles'],redirectUris:['http://localhost:5173/*'],webOrigins:['http://localhost:5173']}],
 users:users.map(({role,...u})=>({...u,enabled:true,emailVerified:true,requiredActions:[],realmRoles:[role],credentials:[{type:'password',value:env.LOCAL_DEMO_PASSWORD,temporary:false}]}))};
fs.writeFileSync(`.local/realms/${env.KEYCLOAK_REALM}-realm.json`,JSON.stringify(realm,null,2),{mode:0o600});
fs.chmodSync(`.local/realms/${env.KEYCLOAK_REALM}-realm.json`,0o600);
const frontend='../../Zelosify-Frontend/.env.local';
if(!fs.existsSync(frontend))fs.writeFileSync(frontend,'NEXT_PUBLIC_BACKEND_URL=http://localhost:5050/api/v1\n',{mode:0o600});
console.log('Local configuration ready; credentials preserved and hidden.');
