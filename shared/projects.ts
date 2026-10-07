export type ProjectSummary = {id:string;name:string;updatedAt:string;duration:number;width:number;height:number;fps:number;thumbnail?:string;clips:number;recoveredFrom?:'backup'|'snapshot'};

export const projectDateName=(date=new Date())=>`${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
export function nextProjectName(names:Iterable<string>,date=new Date()){
  const used=new Set(names),base=projectDateName(date);let name=base,suffix=0;
  while(used.has(name))name=`${base}_${++suffix}`;
  return name;
}

export type ProjectSnapshotSummary={id:string;createdAt:string;reason:'auto'|'manual';projectUpdatedAt:string;name:string;clips:number;duration:number};
