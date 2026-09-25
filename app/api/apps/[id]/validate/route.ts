import { NextResponse } from 'next/server';
import { read } from '@/lib/storage';
import { APPS } from '@/lib/message-manager';
import { validateApp } from '@/lib/firebase-service';
import { decrypt } from '@/lib/encryption';
import type { FirebaseApp } from '@/lib/types';
export const runtime='nodejs';
export async function POST(_request:Request,{params}:{params:{id:string}}){try{const apps=await read<FirebaseApp[]>(APPS);const app=apps.find(item=>item.id===params.id);if(!app)return NextResponse.json({success:false,error:'App not found'},{status:404});await validateApp(JSON.parse(decrypt(app.serviceAccountEncrypted)));return NextResponse.json({success:true,data:{valid:true,projectId:app.projectId}})}catch(error){return NextResponse.json({success:false,error:(error as Error).message||'Firebase validation failed'},{status:400})}}
