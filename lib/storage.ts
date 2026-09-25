import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { decrypt, encrypt } from './encryption';
const directory=process.env.DATA_DIR || path.join(process.cwd(),'data');
const allowed=new Set(['apps.enc.json','messages.enc.json','delivery-logs.enc.json','settings.enc.json']);
const defaults:Record<string,unknown>={'apps.enc.json':[],'messages.enc.json':[],'delivery-logs.enc.json':[],'settings.enc.json':{maxConcurrency:Number(process.env.FCM_MAX_CONCURRENCY||5),maxRetries:Number(process.env.FCM_MAX_RETRIES||3)}};
const locks=new Map<string,Promise<unknown>>();
function filePath(filename:string){ if(!allowed.has(filename)) throw new Error('Unsupported storage file'); return path.join(directory,filename); }
async function ensure(filename:string){ await fs.mkdir(directory,{recursive:true,mode:0o700}); const target=filePath(filename); try{await fs.access(target)}catch{await fs.writeFile(target,encrypt(JSON.stringify(defaults[filename]))+'\n',{mode:0o600,flag:'wx'}).catch((e:any)=>{if(e.code!=='EEXIST')throw e})} return target; }
export async function read<T>(filename:string):Promise<T>{ const target=await ensure(filename); try{return JSON.parse(decrypt(await fs.readFile(target,'utf8'))) as T}catch(e){throw new Error('Could not read encrypted '+filename+': '+(e as Error).message)} }
export async function write<T>(filename:string,data:T):Promise<void>{ const target=await ensure(filename); const temp=target+'.'+process.pid+'.'+crypto.randomUUID()+'.tmp'; try{await fs.writeFile(temp,encrypt(JSON.stringify(data))+'\n',{mode:0o600,flag:'wx'}); await fs.rename(temp,target)}finally{await fs.rm(temp,{force:true})} }
export async function update<T>(filename:string,mutate:(current:T)=>T|Promise<T>):Promise<T>{ const previous=locks.get(filename)||Promise.resolve(); const next=previous.then(async()=>{const current=await read<T>(filename);const updated=await mutate(current);await write(filename,updated);return updated}); locks.set(filename,next); try{return await next}finally{if(locks.get(filename)===next)locks.delete(filename)} }
export async function remove(filename:string){await fs.rm(filePath(filename),{force:true})}
export async function storageStatus(){await fs.mkdir(directory,{recursive:true,mode:0o700});const stats=await fs.stat(directory);return {status:'ok' as const,directoryConfigured:!!process.env.DATA_DIR,permissions:(stats.mode&0o777).toString(8)}}
