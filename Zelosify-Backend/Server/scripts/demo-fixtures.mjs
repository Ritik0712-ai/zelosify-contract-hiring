import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export function makeDemoPdf(name='Sam Patel'){
 const lines=[`${name} | Demo profile`,'Fictional candidate for application testing','Software engineer: 5 years','Skills: React, TypeScript, Node.js, PostgreSQL','Location: Bengaluru','Education: B.Tech Computer Science'];
 const escape=s=>s.replace(/([\\()])/g,'\\$1');
 const text=`BT /F1 18 Tf 60 760 Td (${escape(lines[0])}) Tj /F1 12 Tf ${lines.slice(1).map(line=>`0 -32 Td (${escape(line)}) Tj`).join(' ')} ET`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[0];
 objects.forEach((body,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${body}\nendobj\n`;});
 const start=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
 return Buffer.from(pdf);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 fs.mkdirSync('.local/fixtures',{recursive:true});
 fs.writeFileSync('.local/fixtures/sam-patel.pdf',makeDemoPdf());
 fs.writeFileSync('.local/fixtures/alex-morgan.pdf',makeDemoPdf('Alex Morgan'));
 console.log('Two fictional PDF demo profiles are ready in .local/fixtures.');
}
