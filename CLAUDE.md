# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Coupang (Korean e-commerce) automation tool built with Node.js and Playwright. The codebase is primarily documented in Korean, focusing on automated product search and browser interaction with advanced V2 architecture.

## Essential Commands

### Development Commands
```bash
# Install dependencies and Playwright browser
npm install
npx playwright install chromium

# Run single instance (default mode)
node index.js --agent test1 --once

# Run with continuous mode
node index.js --agent test1

# Run API mode (connects to hub server)
node index.js --api --instance 1 --threads 4

# Clean up old reports
npm run cleanup

# Database management tools (Korean output)
node tools/quick-check.js                    # Fast system health check
node tools/db-manager.js check data          # Check V2 system status
node tools/db-manager.js analyze errors      # Analyze error patterns
node tools/db-manager.js check realtime      # Monitor live execution
node tools/db-manager.js cleanup stuck       # Clean up stuck executions
```

### Database Setup
```bash
# Create V2 database tables (preferred)
node tools/create-v2-tables.js

# Database migration tools
node tools/migrate-to-keyword-mode-enum.js    # Apply ENUM migration
node tools/run-full-migration.js              # Run complete migration
```

### Testing Commands
```bash
# Test Chrome path and browser launch
node tools/test-chrome-path.js

# Test blocking settings
node tools/test-blocking-settings.js

# Test traffic optimization
node tools/traffic-optimization-test.js
```

## Architecture Overview

### Dual-Architecture System

The system operates on a **dual-architecture model**:
- **V1 Legacy**: Original system for backward compatibility
- **V2 Enhanced**: Advanced logging, keyword-level mode management, and network state tracking

### Execution Modes

1. **Database Mode** (Default): Reads keywords from PostgreSQL database
   - Single agent: `--agent test1 --once`
   - Continuous: `--agent test1`
   
2. **API Mode**: Connects to hub server for task distribution
   - `--api --instance 1 --threads 4`
   - Hub URL: `http://mkt.techb.kr:3001`
   - Supports multi-threading and instance isolation

### Core Components

1. **Entry Points**
   - `index.js` - Unified execution with automatic Ubuntu dependency checking for Linux environments
   - Supports both database and API modes with different execution paths

2. **Browser Automation Layer** (`lib/core/`)
   - `chrome-launcher.js` - Playwright Chrome instances with anti-detection
   - `optimizer_db.js` - Database-controlled resource filtering (500KB target)
   - `traffic-monitor.js` - Real-time traffic monitoring with `--monitor` flag

3. **Business Logic** (`lib/handlers/`)
   - `coupang-handler.js` - Main automation logic with V2 logging integration
   - `cart-handler.js` - Shopping cart workflows
   - `product-finder-v2.js` - Enhanced product search with better error handling
   - `search-mode-handler.js` - Dynamic search mode switching
   - `smart-navigation-handler.js` - Intelligent navigation with retry logic

4. **Service Layer** (`lib/services/`)
   - **V2 Services**:
     - `db-service-v2.js` - Enhanced PostgreSQL integration
     - `action-logger-v2.js` - State machine-based action tracking
     - `search-mode-manager-v2.js` - Advanced keyword mode management
     - `hub-api-client.js` - Hub server communication for API mode
   - **Execution Management**:
     - `v2-execution-logger.js` - Session-based execution tracking
     - `concurrent-block-detector.js` - Real-time blocking detection
     - `global-block-detector.js` - System-wide block monitoring

5. **Network Analysis** (`lib/network/`)
   - `monitor.js` - CDP-based traffic monitoring
   - `analyzer.js` - Network analysis and reporting
   - `block-analyzer.js` - Resource blocking insights

### Database Schema (V2)

- `v2_test_keywords` - Keywords with ENUM-based mode management
- `v2_execution_logs` - Comprehensive execution tracking
- `v2_error_logs` - Enhanced error logging with action_id, network_state
- `v2_action_logs` - State machine action tracking

### Key Design Patterns

- **Action State Machine**: V2 ActionLogger tracks complex workflows with database integration
- **Anti-Detection**: User agent spoofing, WebDriver hiding, viewport randomization
- **Resource Optimization**: Database-controlled domain filtering targeting 500KB traffic
- **Session Isolation**: UUID-based session tracking for concurrent execution
- **Dynamic Mode Switching**: Automatic goto ↔ search mode based on blocking patterns

## Configuration

Configuration is hardcoded in `environment.js` (root directory):
- Database: mkt.techb.kr:5432 (PostgreSQL)
- Screen: 1200x800
- Timeouts: 30s default, 60s navigation
- Credentials are embedded for single-user deployment

## CLI Options

```
--agent <name>      Agent name (default: from environment.js)
--once              Run once and exit
--monitor           Enable real-time traffic monitoring logs
--check-cookies     Track cookie changes
--no-ip-change      Disable IP changes (testing)
--api               Enable API mode
--instance <n>      Instance number for API mode
--threads <n>       Thread count for API mode
```

## Development Guidelines

### V2 Error Logging
- Use `getCurrentActionDbId()` from ActionLoggerV2 for integer action IDs
- Collect network state for connection-related errors
- Use `dbServiceV2.logErrorV2()` for structured error tracking

### Mode Management  
- Keyword-level mode management through `search-mode-manager-v2.js`
- Automatic switching after 5 consecutive blocks
- Returns to goto mode after 20 successful searches

### Database Tools Strategy
- Use unified `db-manager.js` instead of creating new scripts
- Categories: check, analyze, cleanup, etc.
- All output is in Korean for consistency

## Important Notes

- All user-facing messages and comments are in Korean
- The project interacts with Coupang's website with anti-bot measures
- Database is required for full functionality (PostgreSQL with V2 schema)
- Ubuntu/Linux environments require Chrome dependencies (auto-checked in API mode)
- Hub API client includes detailed error debugging with request/response logging