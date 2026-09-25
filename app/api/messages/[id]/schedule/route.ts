import { NextRequest,NextResponse } from 'next/server';
import { update,read } from '@/lib/storage';
import { MESSAGES } from '@/lib/message-manager';
import type { Message } from '@/lib/types';
export const runtime='nodejs';
export async function POST(request:NextRequest,{params}:{params:{id:string}}){try{const body=await request.json();const time=new Date(body.scheduledTime);if(!body.scheduledTime||Number.isNaN(time.getTime())||time.getTime()<=Date.now())return NextResponse.json({success:false,error:'Choose a future date and time.'},{status:400});let found=false;await update<Message[]>(MESSAGES,items=>items.map(message=>{if(message.id!==params.id)return message;found=true;return {...message,status:'scheduled',scheduledTime:time.toISOString(),timezone:typeof body.timezone==='string'?body.timezone:'UTC',sendImmediately:false,updatedAt:new Date().toISOString()}}));if(!found)return NextResponse.json({success:false,error:'Message not found'},{status:404});return NextResponse.json({success:true,data:(await read<Message[]>(MESSAGES)).find(message=>message.id===params.id)})}catch{return NextResponse.json({success:false,error:'Unable to schedule message'},{status:400})}}
