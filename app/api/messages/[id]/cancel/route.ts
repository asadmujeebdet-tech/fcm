import { NextResponse } from 'next/server';
import { update } from '@/lib/storage';
import { MESSAGES } from '@/lib/message-manager';
import type { Message } from '@/lib/types';
export const runtime='nodejs';
export async function POST(_request:Request,{params}:{params:{id:string}}){let found=false;await update<Message[]>(MESSAGES,items=>items.map(message=>{if(message.id!==params.id)return message;found=true;return {...message,status:'cancelled',updatedAt:new Date().toISOString()}}));return found?NextResponse.json({success:true}):NextResponse.json({success:false,error:'Message not found'},{status:404})}
