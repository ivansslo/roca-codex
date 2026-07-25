import { execSync } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

console.log('\x1b[35m=== [ROC AGENTS] Post-Installation Cleanup & Setup ===\x1b[0m');

try {
  // 1. Clean .vite cache to prevent stale builds
  const viteCachePath = path.join('node_modules', '.vite');
  if (fs.existsSync(viteCachePath)) {
    console.log('🧹 Cleaning up stale Vite cache...');
    fs.rmSync(viteCachePath, { recursive: true, force: true });
    console.log('✅ Vite cache cleaned.');
  }

  // 2. Force install native rollup binaries based on current architecture/platform
  const platform = os.platform();
  const arch = os.arch();
  
  console.log(`Detected Platform: ${platform}-${arch}`);

  // We always wrap in a try-catch block so that if the platform mismatch throws an EBADPLATFORM or other error,
  // it doesn't break the entire "npm install" build pipeline, especially on the cloud container (x64)
  try {
    if (arch === 'arm64') {
      console.log('🛠️ Local platform is ARM64. Forcing installation of native Rollup dependency for ARM64...');
      if (platform === 'linux') {
        console.log('Running: npm install @rollup/rollup-linux-arm64-gnu --legacy-peer-deps --no-save --force');
        execSync('npm install @rollup/rollup-linux-arm64-gnu --legacy-peer-deps --no-save --force', { stdio: 'inherit' });
      } else if (platform === 'darwin') {
        console.log('Running: npm install @rollup/rollup-darwin-arm64 --legacy-peer-deps --no-save --force');
        execSync('npm install @rollup/rollup-darwin-arm64 --legacy-peer-deps --no-save --force', { stdio: 'inherit' });
      }
    } else {
      console.log('Local platform is not ARM64. Skipping explicit ARM64 rollup package installation.');
    }
  } catch (innerErr) {
    console.warn('⚠️ Warning during native Rollup package installation (ignored to prevent build failure):', innerErr.message);
  }

  console.log('✅ Post-installation script finished successfully!');
} catch (err) {
  console.warn('⚠️ Post-installation cleanup encountered an error (non-blocking):', err.message);
}
