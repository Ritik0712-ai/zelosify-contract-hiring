import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient();
try{
 if(process.env.NODE_ENV!=="development")throw new Error("Local development only");
 await db.$transaction(async tx=>{
  const tenantId='bruce-wayne-corp';
  await tx.tenants.upsert({where:{tenantId},update:{},create:{tenantId,companyName:'Bruce Wayne Corp'}});
  const people=[
   ['vendor.demo','vendor@example.test','Vendor','IT_VENDOR','10000000-0000-4000-8000-000000000001'],
   ['manager.demo','manager@example.test','Manager','HIRING_MANAGER','10000000-0000-4000-8000-000000000002'],
   ['vendor.two','vendor-two@example.test','Partner','IT_VENDOR','10000000-0000-4000-8000-000000000003'],
   ['manager.two','manager-two@example.test','Recruiter','HIRING_MANAGER','10000000-0000-4000-8000-000000000004'],
  ];
  const users={};
  for(const [username,email,lastName,role,externalId] of people){const data={username,email,firstName:'Demo',lastName,role,tenantId,provider:'KEYCLOAK',profileComplete:true};users[username]=await tx.user.upsert({where:{externalId},update:data,create:{...data,externalId}});}
  const rows=[
   ['Senior frontend engineer','Bengaluru','6 months','HYBRID',4,7,['React','TypeScript','Next.js'],'Build accessible hiring experiences for enterprise teams. You will own reusable React interfaces, collaborate with product designers and improve the performance of our customer-facing web application.'],
   ['Backend engineer','Remote','12 months','REMOTE',3,6,['Node.js','PostgreSQL','REST APIs'],'Design reliable APIs and data workflows for a multi-tenant platform. Work with product teams on database design, application security and integrations that hold up under real-world use.'],
   ['Cloud infrastructure engineer','Sydney','6 months','ONSITE',5,9,['AWS','Terraform','Docker'],'Help a growing platform team automate cloud infrastructure, strengthen deployment practices and improve observability across production services.'],
   ['QA automation engineer','Pune','3 months','HYBRID',2,5,['Playwright','JavaScript','API testing'],'Build practical automated coverage for critical customer journeys, investigate regressions and partner with engineers to keep releases dependable.'],
   ['Data engineer','Remote','9 months','REMOTE',4,8,['Python','SQL','Airflow'],'Create reliable data pipelines and maintain well-documented datasets for analytics and operational reporting. Strong ownership of data quality is essential.'],
   ['Product designer','Mumbai','6 months','HYBRID',3,6,['Figma','Accessibility','Design systems'],'Turn complex enterprise workflows into clear interfaces. Work closely with product managers and engineers from discovery through implementation.'],
   ['Full-stack developer','Hyderabad','12 months','HYBRID',2,5,['React','Node.js','PostgreSQL'],'Deliver end-to-end improvements to a B2B application, from database migrations and APIs to intuitive customer-facing screens.'],
   ['Machine learning engineer','Remote','6 months','REMOTE',3,7,['Python','LLM tools','Evaluation'],'Develop explainable AI-assisted workflows and rigorous evaluations. Focus on trustworthy tool use, reliable outputs and measurable performance.'],
   ['Security engineer','Bengaluru','9 months','ONSITE',5,10,['Application security','IAM','Threat modeling'],'Help teams ship secure software through practical threat modeling, access-control reviews and remediation of application security findings.'],
   ['Platform engineer','Remote','12 months','REMOTE',4,8,['Kubernetes','Linux','CI/CD'],'Improve the internal developer platform through reliable builds, deployment automation and service tooling. This role is assigned to a second hiring manager.'],
   ['Mobile application developer','Chennai','6 months','HYBRID',3,6,['React Native','TypeScript','Mobile testing'],'Build mobile interfaces with thoughtful offline and loading states. This requisition is on hold while the team confirms its delivery schedule.'],
   ['Technical business analyst','Mumbai','3 months','ONSITE',2,5,['Requirements analysis','SQL','Stakeholder management'],'Translate business processes into clear requirements and acceptance criteria. This requisition has closed and is retained for reference.'],
  ];
  for(let i=0;i<rows.length;i++){
   const [title,location,contractType,workMode,experienceMin,experienceMax,requiredSkills,description]=rows[i];
   const id=`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
   const data={tenantId,title,location,contractType,workMode,experienceMin,experienceMax,requiredSkills,description,hiringManagerId:users[i<9?'manager.demo':'manager.two'].id,status:i===10?'ON_HOLD':i===11?'CLOSED':'OPEN',expectedCompletionDate:new Date('2026-11-30T12:00:00Z'),postedDate:new Date(Date.UTC(2026,9,30-i,9,0,0))};
   await tx.opening.upsert({where:{id},update:data,create:{id,...data}});
  }
 });
 console.log('Seeded 12 Bruce Wayne Corp openings and four local demo users.');
}finally{await db.$disconnect();}
