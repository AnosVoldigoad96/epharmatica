import { NextResponse } from 'next/server'

/**
 * Health endpoint — used by the deploy pipeline's smoke ping and Uptime Kuma.
 */
export function GET() {
  return NextResponse.json({
    ok: true,
    version: process.env.npm_package_version ?? 'dev',
  })
}
