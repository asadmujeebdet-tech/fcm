import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { encrypt } from '@/lib/encryption';
import { read, update } from '@/lib/storage';
import { APPS } from '@/lib/message-manager';
import { publicApp, parseServiceAccount, cleanText } from '@/lib/validation';
import type { FirebaseApp } from '@/lib/types';

export const runtime='nodejs';
export async function GET(){try{const apps=await read<FirebaseApp[]>(APPS);return NextResponse.json(apps.map(publicApp))}catch{return NextResponse.json({success:false,error:'Unable to load Firebase apps'},{status:500})}}
export async function POST(request:NextRequest){try{const body=await request.json();const credentials=parseServiceAccount(body.serviceAccount);const appName=cleanText(body.appName,'App name',100);const appId=typeof body.appId==='string'?body.appId.trim().slice(0,180):'';const now=new Date().toISOString();const app:FirebaseApp={id:crypto.randomUUID(),appName,appId,projectId:credentials.project_id,serviceAccountEncrypted:encrypt(JSON.stringify(credentials)),createdAt:now,updatedAt:now,isActive:true};await update<FirebaseApp[]>(APPS,current=>[app,...current]);return NextResponse.json({success:true,data:publicApp(app)},{status:201})}catch(error){return NextResponse.json({success:false,error:(error as Error).message||'Unable to save Firebase app'},{status:400})}}
