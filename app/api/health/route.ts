import { NextResponse } from 'next/server';
import { storageStatus } from '@/lib/storage';
import { read } from '@/lib/storage';
import type { FirebaseApp } from '@/lib/types';
export const runtime='nodejs';
export async function GET(){try{await Promise.all([storageStatus(),read<FirebaseApp[]>('apps.enc.json')]);return NextResponse.json({status:'ok',storage:'ok',firebase:'ready',scheduler:'running',timestamp:new Date().toISOString()})}catch{return NextResponse.json({status:'degraded',storage:'unavailable',firebase:'ready',scheduler:'running',timestamp:new Date().toISOString()},{status:503})}}
