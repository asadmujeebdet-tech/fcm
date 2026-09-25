import { read,update } from './storage';
import { sendMessage,MESSAGES } from './message-manager';
import type { Message } from './types';

type GlobalScheduler=typeof globalThis&{__fcmLocalSchedulerStarted?:boolean};
export function startScheduler(){const state=globalThis as GlobalScheduler;if(state.__fcmLocalSchedulerStarted)return;state.__fcmLocalSchedulerStarted=true;
  const tick=async()=>{try{const now=Date.now();const due=(await read<Message[]>(MESSAGES)).filter(message=>message.status==='scheduled'&&message.scheduledTime&&Date.parse(message.scheduledTime)<=now);for(const message of due){await update<Message[]>(MESSAGES,items=>items.map(item=>item.id===message.id&&item.status==='scheduled'?{...item,status:'sending',updatedAt:new Date().toISOString()}:item));void sendMessage(message.id).catch(error=>console.error('[scheduler] Scheduled message failed:',(error as Error).message))}}catch(error){console.error('[scheduler] Unable to scan scheduled messages:',(error as Error).message)}};
  const timer=setInterval(tick,60_000);timer.unref?.();void tick();
}
