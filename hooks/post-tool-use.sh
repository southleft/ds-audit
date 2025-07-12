#!/bin/bash

# Design System Audit - PostToolUse Hook
# Runs after successful tool operations to validate design system compliance

# Configuration
AUDIT_LOG_DIR="./audit-logs"
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
LOG_FILE="$AUDIT_LOG_DIR/audit-$TIMESTAMP.log"

# Tool information from environment
TOOL_NAME="${CLAUDE_TOOL_NAME:-unknown}"
TOOL_PARAMS="${CLAUDE_TOOL_PARAMS:-'{}'}"

# Initialize log
echo "=== Design System Audit Log ===" > "$LOG_FILE"
echo "Timestamp: $TIMESTAMP" >> "$LOG_FILE"
echo "Tool: $TOOL_NAME" >> "$LOG_FILE"
echo "Parameters: $TOOL_PARAMS" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Function to check design tokens
check_design_tokens() {
    echo "Checking design token usage..." >> "$LOG_FILE"
    
    # Check for token files
    if [ -d "tokens" ] || [ -d "design-tokens" ]; then
        echo "✓ Design tokens directory found" >> "$LOG_FILE"
        
        # Check for hardcoded values in CSS/SCSS files
        if command -v rg &> /dev/null; then
            echo "Scanning for hardcoded values..." >> "$LOG_FILE"
            rg -i '(color:|background-color:|font-size:|padding:|margin:)\s*#[0-9a-fA-F]{3,6}' --type css --type scss 2>/dev/null | head -20 >> "$LOG_FILE" || true
            rg -i '(color:|background-color:|font-size:|padding:|margin:)\s*\d+px' --type css --type scss 2>/dev/null | head -20 >> "$LOG_FILE" || true
        fi
    else
        echo "⚠ No design tokens directory found" >> "$LOG_FILE"
    fi
}

# Function to check component structure
check_component_structure() {
    echo "" >> "$LOG_FILE"
    echo "Checking component structure..." >> "$LOG_FILE"
    
    # Look for component directories
    for dir in "components" "src/components" "lib/components"; do
        if [ -d "$dir" ]; then
            echo "✓ Components directory found: $dir" >> "$LOG_FILE"
            
            # Check for consistent file structure
            find "$dir" -type f -name "*.tsx" -o -name "*.jsx" 2>/dev/null | head -10 >> "$LOG_FILE" || true
            
            # Check for test files
            test_count=$(find "$dir" -type f \( -name "*.test.*" -o -name "*.spec.*" \) 2>/dev/null | wc -l || echo 0)
            echo "  Test files found: $test_count" >> "$LOG_FILE"
            
            # Check for documentation
            doc_count=$(find "$dir" -type f -name "*.md" 2>/dev/null | wc -l || echo 0)
            echo "  Documentation files found: $doc_count" >> "$LOG_FILE"
        fi
    done
}

# Function to check documentation
check_documentation() {
    echo "" >> "$LOG_FILE"
    echo "Checking documentation..." >> "$LOG_FILE"
    
    # Check for main documentation files
    for file in "README.md" "CONTRIBUTING.md" "CHANGELOG.md" "docs/README.md"; do
        if [ -f "$file" ]; then
            echo "✓ Found: $file" >> "$LOG_FILE"
        else
            echo "✗ Missing: $file" >> "$LOG_FILE"
        fi
    done
    
    # Check for Storybook
    if [ -f ".storybook/main.js" ] || [ -f ".storybook/main.ts" ]; then
        echo "✓ Storybook configuration found" >> "$LOG_FILE"
    fi
}

# Function to validate code changes
validate_code_changes() {
    if [ "$TOOL_NAME" == "Edit" ] || [ "$TOOL_NAME" == "Write" ] || [ "$TOOL_NAME" == "MultiEdit" ]; then
        echo "" >> "$LOG_FILE"
        echo "Validating code changes..." >> "$LOG_FILE"
        
        # Extract file path from parameters
        FILE_PATH=$(echo "$TOOL_PARAMS" | jq -r '.file_path // empty' 2>/dev/null || echo "")
        
        if [ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ]; then
            echo "Modified file: $FILE_PATH" >> "$LOG_FILE"
            
            # Check file type and run appropriate validators
            case "$FILE_PATH" in
                *.css|*.scss|*.sass)
                    echo "  Type: Stylesheet" >> "$LOG_FILE"
                    # Run stylelint if available
                    if command -v stylelint &> /dev/null; then
                        stylelint "$FILE_PATH" --formatter compact 2>&1 | head -20 >> "$LOG_FILE" || true
                    fi
                    ;;
                *.tsx|*.jsx|*.ts|*.js)
                    echo "  Type: JavaScript/TypeScript" >> "$LOG_FILE"
                    # Check for ESLint
                    if [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ] || [ -f "eslint.config.js" ]; then
                        echo "  ✓ ESLint configuration found" >> "$LOG_FILE"
                    fi
                    ;;
                *.md)
                    echo "  Type: Documentation" >> "$LOG_FILE"
                    ;;
            esac
        fi
    fi
}

# Run audit checks based on tool type
case "$TOOL_NAME" in
    "Edit"|"Write"|"MultiEdit")
        validate_code_changes
        check_design_tokens
        ;;
    "Bash")
        # Log command execution
        echo "Command executed via Bash tool" >> "$LOG_FILE"
        ;;
    *)
        # Run general checks periodically
        check_component_structure
        check_documentation
        ;;
esac

# Summary
echo "" >> "$LOG_FILE"
echo "=== Audit Complete ===" >> "$LOG_FILE"

# Output summary to stderr (visible in Claude Code)
if [ -f "$LOG_FILE" ]; then
    echo "Design system audit completed. Log saved to: $LOG_FILE" >&2
fi

# Exit successfully
exit 0