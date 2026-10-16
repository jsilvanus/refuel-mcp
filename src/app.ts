import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import type {Pool} from 'pg';
import {FuelConnector} from './connector.js';
import {mountMcpHttp} from './mcp/http.js';
import {mountOAuthMetadata} from './oauth-metadata.js';
import {mountAuthorizationServer,type AuthorizationServerOptions} from './oauth/authorization-server.js';
import type {AuthStore,UserStore} from './storage/interface.js';
export async function buildApp(o:{publicUrl:string;jwtSecret:Uint8Array;store:AuthStore;users:UserStore;db:Pool;authMode:'bearer'|'oauth';bearerToken?:string;defaultUserId:string;authorization?:AuthorizationServerOptions;logger?:boolean}){
 const app=Fastify({logger:o.logger??true,bodyLimit:1024*1024});await app.register(formbody);
 if(o.authMode==='oauth'){const resource=o.publicUrl+'/mcp';await mountOAuthMetadata(app,o.publicUrl);await mountAuthorizationServer(app,o.publicUrl,resource,o.jwtSecret,o.store,o.users,o.authorization);}
 await mountMcpHttp(app,{connector:new FuelConnector(o.db),publicUrl:o.publicUrl,jwtSecret:o.jwtSecret,resource:o.publicUrl+'/mcp',authMode:o.authMode,...(o.bearerToken?{bearerToken:o.bearerToken}:{}),userId:o.defaultUserId});
 app.get('/health',async()=>({ok:true}));return app;
}