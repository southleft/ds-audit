#!/bin/bash

# Design System Audit - Notification Hook
# Monitors and alerts on design system compliance events

# Configuration
AUDIT_LOG_DIR="./audit-logs"
NOTIFICATION_LOG="$AUDIT_LOG_DIR/notifications.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Notification type from environment
NOTIFICATION_TYPE="${CLAUDE_NOTIFICATION_TYPE:-unknown}"
NOTIFICATION_MESSAGE="${CLAUDE_NOTIFICATION_MESSAGE:-''}"

# Create log directory if it doesn't exist
mkdir -p "$AUDIT_LOG_DIR"

# Function to log notification
log_notification() {
    local level="$1"
    local message="$2"
    echo "[$TIMESTAMP] [$level] $message" >> "$NOTIFICATION_LOG"
}

# Function to check audit health
check_audit_health() {
    local issues=0
    local warnings=""
    
    # Check if design tokens exist
    if [[ ! -d "tokens" ]] && [[ ! -d "design-tokens" ]]; then
        warnings+="⚠️  No design tokens directory found\n"
        ((issues++))
    fi
    
    # Check if components directory exists
    if [[ ! -d "components" ]] && [[ ! -d "src/components" ]]; then
        warnings+="⚠️  No components directory found\n"
        ((issues++))
    fi
    
    # Check for documentation
    if [[ ! -f "README.md" ]]; then
        warnings+="⚠️  No README.md found\n"
        ((issues++))
    fi
    
    # Check for audit configuration
    if [[ ! -f "audit-config.json" ]] && [[ ! -f ".dsaudit" ]]; then
        warnings+="⚠️  No audit configuration found\n"
        ((issues++))
    fi
    
    if [[ $issues -gt 0 ]]; then
        echo -e "$warnings"
        return $issues
    fi
    
    return 0
}

# Function to generate audit summary
generate_audit_summary() {
    local summary_file="$AUDIT_LOG_DIR/summary-$TIMESTAMP.txt"
    
    echo "Design System Audit Summary - $TIMESTAMP" > "$summary_file"
    echo "===========================================" >> "$summary_file"
    echo "" >> "$summary_file"
    
    # Count components
    local component_count=0
    for dir in "components" "src/components" "lib/components"; do
        if [[ -d "$dir" ]]; then
            component_count=$(find "$dir" -type f \( -name "*.tsx" -o -name "*.jsx" \) 2>/dev/null | wc -l || echo 0)
            echo "Components found: $component_count (in $dir)" >> "$summary_file"
            break
        fi
    done
    
    # Count tokens
    local token_count=0
    for dir in "tokens" "design-tokens"; do
        if [[ -d "$dir" ]]; then
            token_count=$(find "$dir" -type f \( -name "*.json" -o -name "*.js" -o -name "*.ts" \) 2>/dev/null | wc -l || echo 0)
            echo "Token files found: $token_count (in $dir)" >> "$summary_file"
            break
        fi
    done
    
    # Recent modifications
    echo "" >> "$summary_file"
    echo "Recent modifications (last 24 hours):" >> "$summary_file"
    find . -type f -mtime -1 \( -name "*.tsx" -o -name "*.jsx" -o -name "*.css" -o -name "*.scss" \) 2>/dev/null | head -10 >> "$summary_file" || echo "  None found" >> "$summary_file"
    
    # Audit log count
    local log_count=$(ls -1 "$AUDIT_LOG_DIR"/audit-*.log 2>/dev/null | wc -l || echo 0)
    echo "" >> "$summary_file"
    echo "Audit logs generated: $log_count" >> "$summary_file"
    
    echo "$summary_file"
}

# Function to handle idle monitoring
handle_idle_monitoring() {
    log_notification "INFO" "Idle period detected - running health check"
    
    local health_issues
    health_issues=$(check_audit_health)
    local exit_code=$?
    
    if [[ $exit_code -gt 0 ]]; then
        log_notification "WARNING" "Design system health check found $exit_code issues"
        echo "Design System Health Check - Found Issues:" >&2
        echo "$health_issues" >&2
        
        # Generate and display summary
        local summary_file
        summary_file=$(generate_audit_summary)
        echo "" >&2
        echo "Audit summary saved to: $summary_file" >&2
    else
        log_notification "INFO" "Design system health check passed"
    fi
}

# Function to handle permission requests
handle_permission_request() {
    log_notification "SECURITY" "Permission request: $NOTIFICATION_MESSAGE"
    
    # Check if permission relates to protected resources
    if echo "$NOTIFICATION_MESSAGE" | grep -qiE "(token|audit-config|governance)"; then
        echo "⚠️  SECURITY NOTICE: Request involves design system critical resources" >&2
        log_notification "SECURITY" "Critical resource access requested"
    fi
}

# Main notification handling
case "$NOTIFICATION_TYPE" in
    "idle")
        handle_idle_monitoring
        ;;
    "permission")
        handle_permission_request
        ;;
    "error")
        log_notification "ERROR" "$NOTIFICATION_MESSAGE"
        echo "❌ Design System Audit Error: Check logs at $NOTIFICATION_LOG" >&2
        ;;
    *)
        log_notification "INFO" "Notification: $NOTIFICATION_TYPE - $NOTIFICATION_MESSAGE"
        ;;
esac

# Periodic summary generation (every 10 notifications)
notification_count=$(wc -l < "$NOTIFICATION_LOG" 2>/dev/null || echo 0)
if [[ $((notification_count % 10)) -eq 0 ]] && [[ $notification_count -gt 0 ]]; then
    summary_file=$(generate_audit_summary)
    log_notification "INFO" "Generated periodic summary: $summary_file"
    echo "📊 Design System Audit: Periodic summary generated at $summary_file" >&2
fi

# Exit successfully
exit 0