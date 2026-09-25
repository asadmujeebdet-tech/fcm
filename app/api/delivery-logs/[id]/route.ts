import { NextRequest,NextResponse } from 'next/server';
import { read } from '@/lib/storage';
import type { DeliveryLog } from '@/lib/types';
export const runtime='nodejs';
export async function GET(_request:NextRequest,{params}:{params:{id:string}}){try{const logs=await read<DeliveryLog[]>('delivery-logs.enc.json');return NextResponse.json({success:true,data:params.id==='all'?logs:logs.filter(log=>log.messageId===params.id)})}catch{return NextResponse.json({success:false,error:'Unable to load delivery logs'},{status:500})}}
