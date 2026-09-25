import { NextRequest,NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

export function middleware(request:NextRequest){const method=request.method.toUpperCase();const size=Number(request.headers.get('content-length')||0);if(size>1_048_576)return NextResponse.json({success:false,error:'Request body must be 1 MB or smaller.'},{status:413});if(!['POST','PUT','DELETE'].includes(method)||request.nextUrl.pathname==='/api/health')return NextResponse.next();const address=request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';if(!rateLimit(address,60,60_000))return NextResponse.json({success:false,error:'Rate limit exceeded. Try again shortly.'},{status:429});return NextResponse.next()}
export const config={matcher:['/api/:path*']};
