import {Router,Request,Response,NextFunction} from 'express';
import multer from 'multer';
import prisma from '../../config/prisma/prisma.js';
import {authenticateUser} from '../../middlewares/auth/authenticateMiddleware.js';
import {HiringService,Actor,Page} from '../../services/hiring/hiringService.js';
import {S3DocumentStore} from '../../services/hiring/storage.js';
import {HttpError} from '../../services/hiring/errors.js';
import {MAX_FILE_BYTES} from '../../services/hiring/documents.js';
const service=new HiringService(prisma,new S3DocumentStore());
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_FILE_BYTES,files:5,fields:1,fieldSize:100,parts:6}}).array('files',5);
function actor(req:Request):Actor{return {id:req.user.id,tenantId:req.user.tenantId,role:req.user.role};}
function resource(req:Request,key='id'){const id=req.params[key];if(typeof id!=='string'||id.length>100)throw new HttpError(400,'Invalid identifier.');return id;}
function profileId(req:Request){const raw=resource(req);if(!/^[1-9]\d{0,9}$/.test(raw))throw new HttpError(400,'Invalid profile identifier.');const id=Number(raw);if(!Number.isSafeInteger(id)||id<=0)throw new HttpError(400,'Invalid profile identifier.');return id;}
function page(req:Request,profile=false):Page {
  const n=(value:unknown,fallback:number,max:number)=>{if(value===undefined)return fallback;const v=Number(value);if(!Number.isSafeInteger(v)||v<1||v>max)throw new HttpError(400,'Invalid pagination.');return v;};
  const search=req.query.search;
  if(search!==undefined&&(typeof search!=='string'||search.length>100))throw new HttpError(400,'Search is too long.');
  const status=req.query.status;
  if(status!==undefined&&(typeof status!=='string'||!(profile?['SUBMITTED','SHORTLISTED','REJECTED']:['OPEN','CLOSED','ON_HOLD']).includes(status)))throw new HttpError(400,'Invalid status filter.');
  return {page:n(req.query.page,1,10000),limit:n(req.query.limit,12,profile?100:50),search:search as string|undefined,status:status as string|undefined};
}
const run=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{Promise.resolve(fn(req,res)).catch(next);};
export function contractRoutes(role:'IT_VENDOR'|'HIRING_MANAGER'){
  const router=Router();
  router.use((req,_res,next)=>{if(!/^\/(openings|profiles)(\/|$)/.test(req.path)){next('router');return;}next();});
  router.use(authenticateUser);
  router.use((req,res,next)=>{
    if(req.user.role!==role||!req.user.tenantId){res.status(403).json({message:'Access denied.'});return;}
    const origin=req.headers.origin;
    if(origin&&!['http://localhost:5173','http://127.0.0.1:5173'].includes(origin)){res.status(403).json({message:'Untrusted request origin.'});return;}
    res.setHeader('Cache-Control','private, no-store');next();
  });
  router.get('/openings',run(async(req,res)=>res.json(await service.listOpenings(actor(req),page(req)))));
  router.get('/openings/:id',run(async(req,res)=>res.json(await service.opening(actor(req),resource(req)))));
  router.get('/openings/:id/profiles',run(async(req,res)=>res.json(await service.profiles(actor(req),resource(req),page(req,true)))));
  router.get('/profiles/:id/preview',run(async(req,res)=>{
    const download=req.query.download==='1';
    const file=await service.preview(actor(req),profileId(req),download);
    res.setHeader('Content-Type',file.type);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Disposition',`${download?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.send(file.body);
  }));
  if(role==='IT_VENDOR'){
    router.post('/openings/:id/profiles/presign',run(async(req,res)=>res.status(201).json(await service.authorizeUpload(actor(req),resource(req),req.body?.files))));
    router.post('/openings/:id/profiles/upload',upload,run(async(req,res)=>{
      if(typeof req.body?.uploadIntentId!=='string'||req.body.uploadIntentId.length>100)throw new HttpError(400,'Upload authorization is required.');
      const files=((req.files as Express.Multer.File[])||[]).map(file=>{
        let name=file.originalname;try{name=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(name,'latin1'));}catch{}
        return {...file,originalname:name};
      });
      res.status(201).json(await service.submit(actor(req),resource(req),req.body.uploadIntentId,files));
    }));
    router.delete('/profiles/:id',run(async(req,res)=>{await service.remove(actor(req),profileId(req));res.sendStatus(204);}));
  }else{
    router.post('/profiles/:id/recommendation/retry',run(async(req,res)=>res.status(202).json(await service.retryRecommendation(actor(req),profileId(req)))));
    for(const [action,target] of [['shortlist','SHORTLISTED'],['reject','REJECTED']] as const){
      router.post(`/profiles/:id/${action}`,run(async(req,res)=>{
        if(!['SUBMITTED','SHORTLISTED','REJECTED'].includes(req.body?.expectedStatus))throw new HttpError(400,'The current profile status is required.');
        res.json(await service.decide(actor(req),profileId(req),target,req.body.expectedStatus));
      }));
    }
  }
  router.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
    if(error instanceof HttpError){res.status(error.status).json({message:error.message});return;}
    if(error instanceof multer.MulterError){res.status(400).json({message:error.code==='LIMIT_FILE_SIZE'?'Each file must be 10 MB or smaller.':'Upload up to 5 files, with a combined size of 25 MB or smaller.'});return;}
    console.error(JSON.stringify({event:'hiring.request.failed',error:error instanceof Error?error.name:'UnknownError'}));
    res.status(503).json({message:'The request could not be completed. Try again shortly.'});
  });
  return router;
}
