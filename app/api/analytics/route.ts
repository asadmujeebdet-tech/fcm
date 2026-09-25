import { NextResponse } from 'next/server';
import { read } from '@/lib/storage';
import type { FirebaseApp,Message } from '@/lib/types';
export const runtime='nodejs';
export async function GET(){try{const [apps,messages]=await Promise.all([read<FirebaseApp[]>('apps.enc.json'),read<Message[]>('messages.enc.json')]);const sent=messages.reduce((sum,item)=>sum+item.totalSent,0);const failed=messages.reduce((sum,item)=>sum+item.totalFailed,0);return NextResponse.json({success:true,data:{totalApps:apps.length,activeApps:apps.filter(app=>app.isActive).length,totalMessages:messages.length,messagesSent:sent,messagesFailed:failed,successRate:sent+failed?Math.round(sent/(sent+failed)*100):0,scheduledMessages:messages.filter(item=>item.status==='scheduled').length}})}catch{return NextResponse.json({success:false,error:'Unable to load analytics'},{status:500})}}
