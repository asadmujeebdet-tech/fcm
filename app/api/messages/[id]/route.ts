import { NextRequest,NextResponse } from 'next/server';
import { read,update } from '@/lib/storage';
import { MESSAGES } from '@/lib/message-manager';
import type { Message } from '@/lib/types';
export const runtime='nodejs';
export async function GET(_request:NextRequest,{params}:{params:{id:string}}){const item=(await read<Message[]>(MESSAGES)).find(message=>message.id===params.id);return item?NextResponse.json({success:true,data:item}):NextResponse.json({success:false,error:'Message not found'},{status:404})}
export async function DELETE(_request:NextRequest,{params}:{params:{id:string}}){let found=false;await update<Message[]>(MESSAGES,items=>items.map(message=>{if(message.id!==params.id)return message;found=true;if(message.status==='scheduled')return {...message,status:'cancelled',updatedAt:new Date().toISOString()};return message}));return found?NextResponse.json({success:true}):NextResponse.json({success:false,error:'Message not found'},{status:404})}
