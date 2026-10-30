export const VERSION='gemini-tools-v1';
export type Features={experienceYears:number;skills:string[];normalizedSkills:string[];location:string;education:string[];keywords:string[];missingFields:string[]};
export type OpeningDTO={title:string;requiredSkills:string[];experienceMin:number;experienceMax:number|null;location:string;workMode:'REMOTE'|'HYBRID'|'ONSITE'};
const aliases:Record<string,string>={'js':'javascript','ts':'typescript','react.js':'react','reactjs':'react','node.js':'node','nodejs':'node','next.js':'next','nextjs':'next','postgresql':'postgres','postgres':'postgres','amazon web services':'aws','rest apis':'rest','rest api':'rest','restapis':'rest','api testing':'api testing'};
export function canonical(value:string){const key=value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');return aliases[key]||key;}
export function normalize(skills:string[]){return [...new Set(skills.map(canonical).filter(Boolean))].sort();}
export function match(features:Features,opening:OpeningDTO){
 const required=normalize(opening.requiredSkills), matched=required.filter(s=>features.normalizedSkills.includes(s));
 const missing=required.filter(s=>!features.normalizedSkills.includes(s));
 const unknown=new Set(features.missingFields);
 const skillMatchScore=required.length?matched.length/required.length:1;
 const experienceMatchScore=unknown.has('experienceYears')?0:features.experienceYears<opening.experienceMin?0:opening.experienceMax===null||features.experienceYears<=opening.experienceMax?1:0.8;
 const locationMatchScore=opening.workMode==='REMOTE'?1:unknown.has('location')?0:canonical(features.location)===canonical(opening.location)?1:0.5;
 return {experienceYears:features.experienceYears,skills:features.normalizedSkills,location:features.location,skillMatchScore,experienceMatchScore,locationMatchScore,matchedSkills:matched,missingSkills:missing,requiredSkills:required};
}
export function score(vector:ReturnType<typeof match>,features:Features){
 const value=Math.round((0.5*vector.skillMatchScore+0.3*vector.experienceMatchScore+0.2*vector.locationMatchScore)*10000)/10000;
 const category=value>=0.75?'RECOMMENDED':value>=0.5?'BORDERLINE':'NOT_RECOMMENDED';
 const confidence=Math.round((1-features.missingFields.length/3)*100)/100;
 const reason=`${vector.matchedSkills.length}/${vector.requiredSkills.length} required skills matched${vector.requiredSkills.length?'':'; no skills required'}. Experience match ${Math.round(vector.experienceMatchScore*100)}%; location match ${Math.round(vector.locationMatchScore*100)}%.${features.missingFields.length?` Missing evidence: ${features.missingFields.join(', ')}.`:''}`;
 return {score:value,recommended:category==='RECOMMENDED',category,confidence,reason};
}
