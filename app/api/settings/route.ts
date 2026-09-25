import { NextResponse } from 'next/server';
import { read,storageStatus } from '@/lib/storage';
import type { FirebaseApp,Message } from '@/lib/types';
export const runtime='nodejs';
export async function GET(){try{const [apps,messages,_settings,storage]=await Promise.all([read<FirebaseApp[]>('apps.enc.json'),read<Message[]>('messages.enc.json'),read<Record<string,unknown>>('settings.enc.json'),storageStatus()]);return NextResponse.json({success:true,data:{storage:storage.status,permissions:storage.permissions,apps:apps.length,messages:messages.length,encryptionConfigured:!!process.env.ENCRYPTION_SECRET_KEY,concurrency:Number(process.env.FCM_MAX_CONCURRENCY||5),maxRetries:Number(process.env.FCM_MAX_RETRIES||3),scheduler:'running',environment:process.env.NODE_ENV||'development'}})}catch{return NextResponse.json({success:false,error:'Unable to load local storage status'},{status:500})}}
