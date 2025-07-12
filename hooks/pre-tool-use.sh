#!/bin/bash

# Design System Audit - PreToolUse Hook
# Validates operations before execution to ensure design system compliance

# Configuration
PROTECTED_PATHS=(
    "audit-config.json"
    "design-system.config.js"
    ".dsaudit"
    "tokens/core"
    "design-tokens/core"
)

CRITICAL_PATTERNS=(
    "token-definitions"
    "audit-rules"
    "governance-policy"
)

# Tool information from environment
TOOL_NAME="${CLAUDE_TOOL_NAME:-unknown}"
TOOL_PARAMS="${CLAUDE_TOOL_PARAMS:-'{}'}"

# Function to check if path is protected
is_protected_path() {
    local path="$1"
    for protected in "${PROTECTED_PATHS[@]}"; do
        if [[ "$path" == *"$protected"* ]]; then
            return 0
        fi
    done
    return 1
}

# Function to validate design token modifications
validate_token_changes() {
    local file_path="$1"
    local old_content="$2"
    local new_content="$3"
    
    # Check if modifying token files
    if [[ "$file_path" == *"tokens"* ]] || [[ "$file_path" == *"design-tokens"* ]]; then
        echo "Validating design token changes..." >&2
        
        # Check for breaking changes (removing tokens)
        if echo "$old_content" | grep -q '"name":\|"value":\|--' && \
           ! echo "$new_content" | grep -q '"name":\|"value":\|--'; then
            echo "ERROR: Removing design tokens requires approval" >&2
            exit 1
        fi
    fi
}

# Function to validate component changes
validate_component_changes() {
    local file_path="$1"
    
    # Check if component file
    if [[ "$file_path" == *"component"* ]] && [[ "$file_path" == *.tsx || "$file_path" == *.jsx ]]; then
        echo "Validating component changes..." >&2
        
        # Ensure component has associated test file
        local test_file="${file_path%.*}.test.${file_path##*.}"
        local spec_file="${file_path%.*}.spec.${file_path##*.}"
        
        if [[ ! -f "$test_file" ]] && [[ ! -f "$spec_file" ]]; then
            echo "WARNING: Component missing test file: $file_path" >&2
        fi
    fi
}

# Function to check for style violations
check_style_violations() {
    local content="$1"
    local file_path="$2"
    
    # Check CSS/SCSS files for hardcoded values
    if [[ "$file_path" == *.css || "$file_path" == *.scss || "$file_path" == *.sass ]]; then
        # Check for hardcoded colors
        if echo "$content" | grep -qE '(color:|background-color:)\s*#[0-9a-fA-F]{3,6}'; then
            echo "WARNING: Hardcoded color values detected. Use design tokens instead." >&2
        fi
        
        # Check for hardcoded spacing
        if echo "$content" | grep -qE '(padding:|margin:)\s*[0-9]+px'; then
            echo "WARNING: Hardcoded spacing values detected. Use design tokens instead." >&2
        fi
        
        # Check for hardcoded font sizes
        if echo "$content" | grep -qE 'font-size:\s*[0-9]+(px|rem|em)'; then
            echo "WARNING: Hardcoded font sizes detected. Use design tokens instead." >&2
        fi
    fi
}

# Main validation logic
case "$TOOL_NAME" in
    "Edit"|"MultiEdit")
        FILE_PATH=$(echo "$TOOL_PARAMS" | jq -r '.file_path // empty' 2>/dev/null || echo "")
        OLD_STRING=$(echo "$TOOL_PARAMS" | jq -r '.old_string // empty' 2>/dev/null || echo "")
        NEW_STRING=$(echo "$TOOL_PARAMS" | jq -r '.new_string // empty' 2>/dev/null || echo "")
        
        if [ -n "$FILE_PATH" ]; then
            # Check protected paths
            if is_protected_path "$FILE_PATH"; then
                echo "ERROR: Attempting to modify protected file: $FILE_PATH" >&2
                echo "Protected files require manual approval for changes." >&2
                exit 1
            fi
            
            # Validate token changes
            validate_token_changes "$FILE_PATH" "$OLD_STRING" "$NEW_STRING"
            
            # Validate component changes
            validate_component_changes "$FILE_PATH"
            
            # Check style violations
            check_style_violations "$NEW_STRING" "$FILE_PATH"
        fi
        ;;
        
    "Write")
        FILE_PATH=$(echo "$TOOL_PARAMS" | jq -r '.file_path // empty' 2>/dev/null || echo "")
        CONTENT=$(echo "$TOOL_PARAMS" | jq -r '.content // empty' 2>/dev/null || echo "")
        
        if [ -n "$FILE_PATH" ]; then
            # Check protected paths
            if is_protected_path "$FILE_PATH"; then
                echo "ERROR: Attempting to write to protected path: $FILE_PATH" >&2
                exit 1
            fi
            
            # Validate new components
            validate_component_changes "$FILE_PATH"
            
            # Check style violations in new content
            check_style_violations "$CONTENT" "$FILE_PATH"
            
            # Warn about creating files in token directories
            if [[ "$FILE_PATH" == *"tokens"* ]] || [[ "$FILE_PATH" == *"design-tokens"* ]]; then
                echo "WARNING: Creating new token file. Ensure it follows design system conventions." >&2
            fi
        fi
        ;;
        
    "Bash")
        COMMAND=$(echo "$TOOL_PARAMS" | jq -r '.command // empty' 2>/dev/null || echo "")
        
        # Block dangerous commands on protected files
        for protected in "${PROTECTED_PATHS[@]}"; do
            if echo "$COMMAND" | grep -qE "(rm|mv|delete).*$protected"; then
                echo "ERROR: Attempting to remove or move protected files" >&2
                exit 1
            fi
        done
        
        # Warn about design system related commands
        if echo "$COMMAND" | grep -qiE "(token|component|design-system)"; then
            echo "INFO: Executing design system related command" >&2
        fi
        ;;
esac

# Log validation passed
echo "Pre-validation passed for $TOOL_NAME" >&2

# Exit successfully
exit 0