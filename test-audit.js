// Simple test script to verify the audit tool works
const { execSync } = require('child_process');

console.log('Building the project...');
execSync('npm run build', { stdio: 'inherit' });

console.log('\nTesting the CLI...');
execSync('node dist/cli.js --help', { stdio: 'inherit' });

console.log('\nAudit tool is ready to use!');
console.log('Run: npx dsaudit init');