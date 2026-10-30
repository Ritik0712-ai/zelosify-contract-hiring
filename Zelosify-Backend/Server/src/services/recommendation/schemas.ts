import Ajv from 'ajv';
import {AgentError} from './parse.js';
const ajv=new Ajv({allErrors:true,strict:true});
const strings={type:'array',items:{type:'string',minLength:1,maxLength:160},maxItems:80,uniqueItems:true};
const missing={type:'array',items:{type:'string',enum:['experienceYears','skills','location']},maxItems:3,uniqueItems:true};
const unit={type:'number',minimum:0,maximum:1};
const object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const features=object({experienceYears:{type:'number',minimum:0,maximum:80},skills:strings,normalizedSkills:strings,location:{type:'string',maxLength:120},education:strings,keywords:strings,missingFields:missing});
const vector=object({experienceYears:{type:'number',minimum:0,maximum:80},skills:strings,location:{type:'string',maxLength:120},skillMatchScore:unit,experienceMatchScore:unit,locationMatchScore:unit,matchedSkills:strings,missingSkills:strings,requiredSkills:strings});
const result=object({score:unit,recommended:{type:'boolean'},category:{type:'string',enum:['RECOMMENDED','BORDERLINE','NOT_RECOMMENDED']},confidence:unit,reason:{type:'string',minLength:1,maxLength:1000}});
const outputs=new Map(Object.entries({
 parse_resume:object({untrustedResumeText:{type:'string',minLength:30,maxLength:24000},characters:{type:'integer',minimum:30,maximum:24000}}),
 extract_features:object({accepted:{const:true},missingFields:missing}),
 normalize_skills:object({normalizedSkills:strings}),match_profile:vector,score_profile:result,
}).map(([key,schema])=>[key,ajv.compile(schema)]));
const validateFeatures=ajv.compile(features),validateVector=ajv.compile(vector),validateResult=ajv.compile(result);
export function validateToolOutput(name:string,value:unknown){if(!outputs.get(name)?.(value))throw new AgentError('INVALID_TOOL_OUTPUT');}
export function validatePersistence(features:unknown,vector:unknown,result:unknown){if(!validateFeatures(features)||!validateVector(vector)||!validateResult(result))throw new AgentError('INVALID_RESULT_STATE');}
