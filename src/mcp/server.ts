import { McpServer,ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification,ServerRequest,CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { FuelConnector,type ConnectorContext } from '../connector.js';
type Extra=RequestHandlerExtra<ServerRequest,ServerNotification>;
const securitySchemes=[{type:'oauth2' as const,scopes:['mcp']}];
const secure=<T extends object>(x:T)=>({...x,securitySchemes});
const ctx=(e:Extra):ConnectorContext=>({...(typeof e.authInfo?.extra?.userId==='string'?{userId:e.authInfo.extra.userId}:{}),...(e.authInfo?.token?{accessToken:e.authInfo.token}:{})});
const out=(v:unknown):CallToolResult=>({content:[{type:'text',text:JSON.stringify(v,null,2)}]});
const err=(e:unknown):CallToolResult=>({content:[{type:'text',text:e instanceof Error?e.message:String(e)}],isError:true});
const safe=(fn:(a:any,e:Extra)=>Promise<unknown>)=>async(a:any,e:Extra)=>{try{return out(await fn(a,e));}catch(x){return err(x);}};
export function createMcpServer(options:{connector:FuelConnector;publicUrl:string}){
 const s=new McpServer({name:'refuel-mcp',version:'0.1.0'}),c=options.connector;
 const resource=(name:string,template:any,description:string,fn:(uri:URL,v:any,e:Extra)=>Promise<unknown>)=>s.registerResource(name,template,{description,mimeType:'application/json'},async(uri:URL,v:Record<string,string|string[]>,e:Extra)=>({contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(await fn(uri,v,e),null,2)}]}));
 resource('cars',new ResourceTemplate('fuel://cars',{list:undefined}),'Cars owned by the authenticated user.',async(_u,_v,e)=>c.listCars(ctx(e)));
 resource('default-car',new ResourceTemplate('fuel://cars/default',{list:undefined}),'The default car, or null if no default is set.',async(_u,_v,e)=>c.defaultCar(ctx(e)));
 resource('car',new ResourceTemplate('fuel://cars/{carId}',{list:undefined}),'One car belonging to the authenticated user.',async(_u,v,e)=>c.car(ctx(e),String(v.carId)));
 resource('car-months',new ResourceTemplate('fuel://cars/{carId}/months',{list:undefined}),'Months with refuelling history for a car.',async(_u,v,e)=>c.months(ctx(e),String(v.carId)));
 resource('car-month',new ResourceTemplate('fuel://cars/{carId}/months/{month}',{list:undefined}),'Refuelling history and summary for a car in YYYY-MM.',async(_u,v,e)=>c.carMonth(ctx(e),String(v.carId),String(v.month)));
 resource('summary-month',new ResourceTemplate('fuel://summary/months/{month}',{list:undefined}),'All-car purchase summary for YYYY-MM.',async(_u,v,e)=>c.summaryMonth(ctx(e),String(v.month)));
 resource('summary-year',new ResourceTemplate('fuel://summary/year/{year}',{list:undefined}),'Annual purchase summary and monthly breakdown for YYYY.',async(_u,v,e)=>c.summaryYear(ctx(e),String(v.year)));
 s.registerTool('save_car',secure({description:'Create or update a car. Omit car_id to create; supply an existing UUID to update. Omitted fields remain unchanged. is_default=true selects the sole default; false clears it. Archiving clears default; archived cars cannot be default.',inputSchema:{car_id:z.string().uuid().optional(),name:z.string().trim().min(1).max(120).optional(),registration:z.string().max(40).nullable().optional(),fuel_type:z.string().max(40).nullable().optional(),metadata:z.record(z.string(),z.unknown()).optional(),is_default:z.boolean().optional(),is_archived:z.boolean().optional()}}),safe((a,e)=>c.saveCar(ctx(e),a)));
 s.registerTool('save_refueling_record',secure({description:'Create or update a refuelling record. For an existing record, litres=0 soft-deletes; missing litres never deletes; positive litres updates and can restore a soft-deleted record. Create requires litres>0 and total_paid or price_per_litre. When both money values are supplied they must agree within €0.03. Odometer decreases are marked untrusted.',inputSchema:{record_id:z.string().uuid().optional(),car_id:z.string().uuid().optional(),event_at:z.string().datetime({offset:true}).optional(),litres:z.number().finite().optional(),total_paid:z.number().finite().optional(),price_per_litre:z.number().finite().optional(),odometer_km:z.number().finite().nonnegative().nullable().optional(),station:z.string().max(160).nullable().optional(),notes:z.string().max(2000).nullable().optional()}}),safe((a,e)=>c.saveRefueling(ctx(e),a)));
 return s;
}