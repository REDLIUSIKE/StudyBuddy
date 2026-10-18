export interface VideoSelectedPath {path:string;directory:boolean}
export class VideoPathAdmissions {
 constructor(workspaceRoot:string);
 projectPath(path:string):string;
 admit(kind:'project'|'asset'|'export',paths:string[],root?:string):Promise<void>;
 relocated(from:string,to:string):Promise<void>;
 allowsImport(root:string,path:string):boolean;
 assertImport(root:string,path:string):void;
 assertExport(root:string,path:string):void;
 linkedMediaAdmissions():Array<{root:string;paths:VideoSelectedPath[]}>;
}
