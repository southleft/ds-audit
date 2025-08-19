#!/bin/bash

# Test script for Altitude design system analysis

echo "Testing dsaudit with Altitude design system..."

# Create a dummy .env file to bypass API key prompt
cat > ../altitude/.env << EOF
ANTHROPIC_API_KEY=sk-test-dummy-key-for-testing
ANTHROPIC_MODEL=claude-sonnet-4-20250514
EOF

# Run the audit on Altitude
echo "Running audit..."
node dist/cli.js init --path ../altitude --no-interactive

echo ""
echo "Test complete. Check the dashboard at http://localhost:4321"
echo ""
echo "Expected improvements:"
echo "  ✅ Token count should be realistic (not 569 'other' tokens)"
echo "  ✅ Token types should show proper classification (color, spacing, typography)"
echo "  ✅ Coverage should be much higher than 0.4%"
echo "  ✅ Components should show actual token usage (not 0%)"
echo "  ✅ Quick Actions buttons should all work"
echo "  ✅ No raw JSON displayed in the UI"

# Clean up
rm -f ../altitude/.env