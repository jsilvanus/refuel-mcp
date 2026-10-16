export interface AuthorizationCodeRecord { code:string; clientId:string; redirectUri:string; challenge:string; subject:string; scope:string; expires:number; }
export interface RefreshTokenRecord { token:string; clientId:string; subject:string; scope:string; expires:number; }
export interface AuthStore {
 saveAuthorizationCode(record:AuthorizationCodeRecord):Promise<void>;
 consumeAuthorizationCode(code:string):Promise<AuthorizationCodeRecord|undefined>;
 saveRefreshToken(record:RefreshTokenRecord):Promise<void>;
 getRefreshToken(token:string):Promise<RefreshTokenRecord|undefined>;
}
export interface McpUser { id:string; name:string; email?:string; passwordHash?:string; createdAt:number; }
export interface UserStore {
 createUser(user:McpUser):Promise<void>; listUsers():Promise<McpUser[]>;
 getUser(id:string):Promise<McpUser|undefined>; getUserByEmail(email:string):Promise<McpUser|undefined>;
 updateUser(id:string,patch:{name?:string;email?:string;passwordHash?:string}):Promise<McpUser|undefined>;
 deleteUser(id:string):Promise<boolean>;
}