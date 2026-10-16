import {randomUUID} from 'node:crypto';
import {hash} from '@node-rs/argon2';
import {PostgresStore} from '../src/storage/postgres.js';
const store=new PostgresStore();await store.migrate();
const [command,...args]=process.argv.slice(2);
const value=(flag:string)=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
const safe=(u:any)=>{if(!u)return u;const{passwordHash:_,...rest}=u;return rest;};
try {
 if(command==='create'){
  const name=value('--name'),password=value('--password'),email=value('--email');
  if(!name||!password)throw new Error('create requires --name and --password');
  const id=value('--id')??randomUUID();
  await store.createUser({id,name,...(email?{email}:{}),passwordHash:await hash(password,{algorithm:2}),createdAt:Date.now()});
  console.log(JSON.stringify(safe(await store.getUser(id)),null,2));
 } else if(command==='list') console.log(JSON.stringify((await store.listUsers()).map(safe),null,2));
 else if(command==='get'){
  const id=args[0];if(!id)throw new Error('get requires <id>');
  console.log(JSON.stringify(safe(await store.getUser(id)??null),null,2));
 } else if(command==='update'){
  const id=args[0];if(!id)throw new Error('update requires <id>');
  const name=value('--name'),email=value('--email'),password=value('--password');
  const user=await store.updateUser(id,{...(name?{name}:{}),...(email?{email}:{}),...(password?{passwordHash:await hash(password,{algorithm:2})}:{})});
  if(!user)throw new Error('User not found: '+id);console.log(JSON.stringify(safe(user),null,2));
 } else if(command==='delete'){
  const id=args[0];if(!id||!await store.deleteUser(id))throw new Error('User not found');
  console.log('Deleted '+id);
 } else {console.log('Usage: npm run user -- <create|list|get|update|delete>');process.exitCode=1;}
} finally {await store.close();}
