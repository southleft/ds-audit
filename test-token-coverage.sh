#!/bin/bash

# Test script to verify token coverage fixes

echo "Setting up test environment..."

# Create a test .env file with dummy API key to bypass prompt
cat > example-design-system/.env << EOF
ANTHROPIC_API_KEY=sk-test-dummy-key-for-testing
ANTHROPIC_MODEL=claude-sonnet-4-20250514
EOF

echo "Running audit with --no-interactive flag..."
node dist/cli.js init --path example-design-system --no-interactive

echo ""
echo "Test complete. Check the dashboard at http://localhost:4321"
echo "Look for:"
echo "  - Realistic component count (not 487)"
echo "  - Proper coverage percentages (not all 0%)"
echo "  - Correct 'needs attention' logic"
echo "  - Dark theme consistency in token coverage modal"

# Clean up
rm -f example-design-system/.env