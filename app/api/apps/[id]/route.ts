import { NextRequest,NextResponse } from 'next/server';
import { read,update } from '@/lib/storage';
import { APPS } from '@/lib/message-manager';
import { cleanText,parseServiceAccount,publicApp } from '@/lib/validation';
import { encrypt } from '@/lib/encryption';
import type { FirebaseApp } from '@/lib/types';
import { forgetFirebaseInstance } from '@/lib/firebase-service';
export const runtime='nodejs';
export async function PUT(request:NextRequest,{params}:{params:{id:string}}){try{const body=await request.json();const apps=await read<FirebaseApp[]>(APPS);const current=apps.find(app=>app.id===params.id);if(!current)return NextResponse.json({success:false,error:'App not found'},{status:404});const updated={...current,appName:body.appName?cleanText(body.appName,'App name',100):current.appName,appId:typeof body.appId==='string'?body.appId.trim().slice(0,180):current.appId,isActive:typeof body.isActive==='boolean'?body.isActive:current.isActive,updatedAt:new Date().toISOString()};if(body.serviceAccount){const credentials=parseServiceAccount(body.serviceAccount);updated.projectId=credentials.project_id;updated.serviceAccountEncrypted=encrypt(JSON.stringify(credentials));await forgetFirebaseInstance(params.id)}await update<FirebaseApp[]>(APPS,items=>items.map(app=>app.id===params.id?updated:app));return NextResponse.json({success:true,data:publicApp(updated)})}catch(error){return NextResponse.json({success:false,error:(error as Error).message},{status:400})}}
export async function DELETE(_request:NextRequest,{params}:{params:{id:string}}){try{let removed=false;await update<FirebaseApp[]>(APPS,apps=>{removed=apps.some(app=>app.id===params.id);return apps.filter(app=>app.id!==params.id)});if(removed)await forgetFirebaseInstance(params.id);return removed?NextResponse.json({success:true}):NextResponse.json({success:false,error:'App not found'},{status:404})}catch{return NextResponse.json({success:false,error:'Unable to delete app'},{status:500})}}
