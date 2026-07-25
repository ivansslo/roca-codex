import os from 'os';
import fs from 'fs';

console.log('\x1b[35m=== [ROC AGENTS] Rollup Native Diagnostic Check ===\x1b[0m');
console.log(`💻 Platform: ${os.platform()} (${os.release()})`);
console.log(`💻 Architecture: ${os.arch()}`);
console.log(`💻 Node version: ${process.version}`);

async function runCheck() {
  try {
    // Try to dynamically import rollup to trigger native loading
    await import('rollup');
    console.log('\x1b[32m✅ Rollup & native platform binaries loaded successfully!\x1b[0m\n');
  } catch (err) {
    console.error('\x1b[31m❌ Rollup initialization failed!\x1b[0m');
    console.error(`\x1b[31mOriginal Error: ${err.message}\x1b[0m`);
    
    const platform = os.platform();
    const arch = os.arch();
    let expectedPkg = '';
    
    if (platform === 'linux') {
      if (arch === 'arm64') expectedPkg = '@rollup/rollup-linux-arm64-gnu';
      else if (arch === 'x64') expectedPkg = '@rollup/rollup-linux-x64-gnu';
    } else if (platform === 'darwin') {
      if (arch === 'arm64') expectedPkg = '@rollup/rollup-darwin-arm64';
      else if (arch === 'x64') expectedPkg = '@rollup/rollup-darwin-x64';
    } else if (platform === 'win32') {
      if (arch === 'x64') expectedPkg = '@rollup/rollup-win32-x64-msvc';
      else if (arch === 'arm64') expectedPkg = '@rollup/rollup-win32-arm64-msvc';
    }
    
    console.log('\n\x1b[33m🔧 Troubleshooting Guides:\x1b[0m');
    if (expectedPkg) {
      console.log(`Your platform expects the native package: \x1b[36m${expectedPkg}\x1b[0m`);
      console.log(`Please run the following commands to install it manually:`);
      console.log(`\x1b[32m   npm install ${expectedPkg} --save-optional --legacy-peer-deps\x1b[0m`);
    }
    
    console.log('\nAlternatively, this issue is usually caused by npm caching and lockfile mismatches across architectures (e.g., building inside Docker/containers vs macOS).');
    console.log('To completely resolve this, run this clean setup:');
    console.log('\x1b[32m   rm -rf node_modules package-lock.json && npm install --legacy-peer-deps\x1b[0m\n');
    
    process.exit(1);
  }
}

runCheck();
