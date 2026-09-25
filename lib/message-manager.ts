import crypto from 'node:crypto';
import { read, update } from './storage';
import { sendToApps } from './firebase-service';
import type { DeliveryLog, FirebaseApp, Message, MessageRecipient } from './types';

export const MESSAGES='messages.enc.json', APPS='apps.enc.json', LOGS='delivery-logs.enc.json';
export async function sendMessage(messageId:string,retryOnly=false){
  const messages=await read<Message[]>(MESSAGES);const message=messages.find(item=>item.id===messageId);if(!message)throw new Error('Message not found');
  const apps=await read<FirebaseApp[]>(APPS);const appMap=new Map(apps.map(app=>[app.id,app]));
  let targets=message.recipients.filter(recipient=>appMap.has(recipient.appId)&&(!retryOnly||recipient.status==='failed')&&recipient.retryCount<Number(process.env.FCM_MAX_RETRIES||3));
  if(retryOnly&&!targets.length)throw new Error('No failed deliveries are eligible for retry');
  targets=targets.filter(recipient=>appMap.get(recipient.appId)?.isActive);
  await update<Message[]>(MESSAGES,current=>current.map(item=>item.id===messageId?{...item,status:'sending',updatedAt:new Date().toISOString(),recipients:item.recipients.map(recipient=>targets.some(target=>target.id===recipient.id)?{...recipient,status:'sending',updatedAt:new Date().toISOString()}:recipient)}:item));
  const eligible=targets.map(recipient=>appMap.get(recipient.appId)!);
  await sendToApps(eligible,message,Number(process.env.FCM_MAX_CONCURRENCY||5),async result=>{
    const recipient=targets.find(item=>item.appId===result.appId)!;const now=new Date().toISOString();
    await update<Message[]>(MESSAGES,current=>current.map(item=>item.id!==messageId?item:{...item,recipients:item.recipients.map(row=>row.id!==recipient.id?row:{...row,status:result.success?'sent':'failed',fcmMessageId:result.messageId,errorMessage:result.error,retryCount:row.retryCount+(retryOnly?1:0),updatedAt:now}),updatedAt:now}));
    const app=appMap.get(result.appId)!;const log:DeliveryLog={id:crypto.randomUUID(),messageId,appId:result.appId,appName:app.appName,success:result.success,...(result.messageId?{fcmMessageId:result.messageId}:{}),...(result.error?{errorMessage:result.error}:{}),retryCount:recipient.retryCount+(retryOnly?1:0),timestamp:now};
    await update<DeliveryLog[]>(LOGS,current=>[log,...current].slice(0,20000));
  },async app=>{if(retryOnly){const target=targets.find(item=>item.appId===app.id)!;await new Promise(resolve=>setTimeout(resolve,1000*Math.pow(2,target.retryCount))) }});
  await update<Message[]>(MESSAGES,current=>current.map(item=>{if(item.id!==messageId)return item;const sent=item.recipients.filter(r=>r.status==='sent').length;const failed=item.recipients.filter(r=>r.status==='failed').length;return {...item,totalSent:sent,totalFailed:failed,status:sent===item.totalAppsTarget?'sent':sent>0?'partial':'failed',sentAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}));
  return (await read<Message[]>(MESSAGES)).find(item=>item.id===messageId)!;
}
export function makeRecipients(messageId:string,apps:FirebaseApp[]):MessageRecipient[]{const now=new Date().toISOString();return apps.map(app=>({id:crypto.randomUUID(),messageId,appId:app.id,appName:app.appName,packageName:app.appId,status:'pending',retryCount:0,createdAt:now,updatedAt:now}))}
