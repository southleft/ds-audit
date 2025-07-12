# Design System Audit Hooks

This directory contains Claude Code hooks specifically designed for your design system auditing CLI tool.

## Hooks Overview

### 1. PostToolUse Hook (`post-tool-use.sh`)
Runs after successful tool operations to validate design system compliance.

**Features:**
- Validates design token usage
- Checks component structure and test coverage
- Verifies documentation completeness
- Runs style linters on modified files
- Generates detailed audit logs

### 2. PreToolUse Hook (`pre-tool-use.sh`)
Validates operations before execution to ensure design system compliance.

**Features:**
- Protects critical configuration files
- Validates token modifications
- Enforces component testing requirements
- Prevents hardcoded style values
- Blocks dangerous operations on protected paths

### 3. Notification Hook (`notification.sh`)
Monitors and alerts on design system compliance events.

**Features:**
- Periodic health checks during idle time
- Security monitoring for critical resources
- Automatic summary generation
- Issue tracking and reporting

## Configuration

The hooks are configured in `.claude_code_hooks.json`:

```json
{
  "preToolUse": "./hooks/pre-tool-use.sh",
  "postToolUse": "./hooks/post-tool-use.sh",
  "notification": "./hooks/notification.sh"
}
```

## Protected Resources

The following paths are protected by the PreToolUse hook:
- `audit-config.json`
- `design-system.config.js`
- `.dsaudit`
- `tokens/core`
- `design-tokens/core`

## Viewing Audit Logs

Use the provided utility script:

```bash
# View latest audit log
./audit-logs/view-logs.sh

# View all logs
./audit-logs/view-logs.sh --all

# View notifications
./audit-logs/view-logs.sh --notifications

# Filter logs
./audit-logs/view-logs.sh --filter "error"
```

## Customization

To customize the hooks for your specific needs:

1. Edit the `PROTECTED_PATHS` array in `pre-tool-use.sh`
2. Modify validation rules in the check functions
3. Add custom linting commands in `post-tool-use.sh`
4. Adjust notification thresholds in `notification.sh`

## Disabling Hooks

To temporarily disable hooks, rename or remove `.claude_code_hooks.json`.