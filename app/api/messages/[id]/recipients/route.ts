import { NextRequest,NextResponse } from 'next/server';
import { read } from '@/lib/storage';
import { MESSAGES } from '@/lib/message-manager';
import type { Message } from '@/lib/types';
export const runtime='nodejs';
export async function GET(_request:NextRequest,{params}:{params:{id:string}}){const message=(await read<Message[]>(MESSAGES)).find(item=>item.id===params.id);return message?NextResponse.json({success:true,data:message.recipients}):NextResponse.json({success:false,error:'Message not found'},{status:404})}
