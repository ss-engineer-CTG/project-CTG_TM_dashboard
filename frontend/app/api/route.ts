import { NextResponse } from 'next/server';
 
export async function GET() {
  return NextResponse.json({ status: 'API routes are configured but not used directly in this application' });
}