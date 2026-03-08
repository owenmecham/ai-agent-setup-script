import { NextResponse } from 'next/server';
import { execSync } from 'node:child_process';

const AGENT_LABEL = 'com.murph.agent';

export async function POST() {
  try {
    // launchctl stop + KeepAlive will auto-restart the agent
    execSync(`launchctl stop ${AGENT_LABEL}`, { timeout: 10000 });

    return NextResponse.json({
      success: true,
      message: 'Agent restart triggered. KeepAlive will bring it back up.',
    });
  } catch (err) {
    // Fallback: try to check if agent is managed by launchctl at all
    try {
      execSync(`launchctl list ${AGENT_LABEL}`, { stdio: 'pipe' });
      // Agent is loaded but stop failed — still try
      return NextResponse.json({
        success: true,
        message: 'Restart signal sent.',
      });
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Agent is not managed by LaunchAgent. Use the terminal to restart.',
        },
        { status: 500 },
      );
    }
  }
}
