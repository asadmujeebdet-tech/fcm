import { NextResponse } from 'next/server';
import { sendMessage } from '@/lib/message-manager';
export const runtime='nodejs';
export async function POST(_request:Request,{params}:{params:{id:string}}){try{return NextResponse.json({success:true,data:await sendMessage(params.id,true)})}catch(error){return NextResponse.json({success:false,error:(error as Error).message},{status:400})}}
