import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
export const runtime="nodejs";
const updateAppSchema=z.object({name:z.string().min(1).optional(),topic:z.string().optional(),appIconUrl:z.string().url().or(z.literal("")).optional(),isActive:z.boolean().optional()});
const publicColumns="id,user_id,name,project_id,app_icon_url,topic,is_active,created_at,updated_at";
export async function PATCH(req:NextRequest,{params}:{params:{id:string}}){
 const userId=await getCurrentUserId();if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=updateAppSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid input"},{status:400});
 const fields:string[]=[];const values:unknown[]=[];const add=(c:string,v:unknown)=>{fields.push(`${c}=$${values.length+1}`);values.push(v);};
 if(parsed.data.name!==undefined)add("name",parsed.data.name);if(parsed.data.topic!==undefined)add("topic",parsed.data.topic||"");if(parsed.data.appIconUrl!==undefined)add("app_icon_url",parsed.data.appIconUrl||null);if(parsed.data.isActive!==undefined)add("is_active",parsed.data.isActive);
 if(!fields.length)return NextResponse.json({error:"No changes supplied"},{status:400});values.push(params.id,userId);
 try{const r=await query(`UPDATE public.firebase_apps SET ${fields.join(",")},updated_at=now() WHERE id=$${values.length-1} AND user_id=$${values.length} RETURNING ${publicColumns}`,values);if(!r.rows[0])return NextResponse.json({error:"Not found"},{status:404});return NextResponse.json({app:r.rows[0]});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Database error"},{status:500});}
}
export async function DELETE(_req:NextRequest,{params}:{params:{id:string}}){
 const userId=await getCurrentUserId();if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{const r=await query("DELETE FROM public.firebase_apps WHERE id=$1 AND user_id=$2",[params.id,userId]);if(r.rowCount===0)return NextResponse.json({error:"Not found"},{status:404});return NextResponse.json({success:true});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Database error"},{status:500});}
}