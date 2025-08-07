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

# Run multiple concurrent instances (병렬 실행)
node index.js --multi

# Run tests
node tests/chrome-test.js

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

# Legacy V1 setup
scripts\create-db.bat
node tools/create-db.js

# Database migration tools
node tools/migrate-to-keyword-mode-enum.js    # Apply ENUM migration
node tools/setup-keyword-level-modes.js       # Setup keyword mode system
```

## Architecture Overview

### System Architecture (V2)

The system operates on a **dual-architecture model**:
- **V1 Legacy**: Original system for backward compatibility
- **V2 Enhanced**: Advanced logging, keyword-level mode management, and network state tracking

### Core Components

1. **Entry Points**
   - `index.js` - Unified execution file with V2 architecture support
     - Single mode: `--agent test1 --once` (default)
     - Continuous mode: `--agent test1` 
     - Multi mode: `--multi` (parallel browser instances)

2. **Browser Automation Layer** (`lib/core/`)
   - `chrome-launcher.js` - Playwright Chrome instances with anti-detection
   - `optimizer.js` - Database-controlled resource filtering (500KB target)

3. **Business Logic** (`lib/handlers/`)
   - `coupang-handler.js` - Main automation logic with V2 logging integration
   - `cart-handler.js` - Shopping cart workflows
   - `product-finder.js` - Product search and selection logic
   - `search-mode-handler.js` - Manages dynamic search mode switching

4. **Service Layer** (`lib/services/`)
   - **V2 Services**:
     - `db-service-v2.js` - Enhanced PostgreSQL integration with detailed logging
     - `action-logger-v2.js` - State machine-based action tracking with database IDs
     - `search-mode-manager.js` - Keyword-level mode management (goto ↔ search)
   - **Legacy Services**:
     - `db-service.js`, `proxy-manager.js`, `error-logger.js`

5. **Network Analysis** (`lib/network/`)
   - `monitor.js` - Real-time CDP traffic monitoring
   - `analyzer.js` - Network analysis and reporting
   - `block-analyzer.js` - Resource blocking insights

6. **Database Schema** (V2)
   - `v2_test_keywords` - Keywords with ENUM-based mode management and blocking counters
   - `v2_execution_logs` - Comprehensive execution tracking with session isolation
   - `v2_error_logs` - Enhanced error logging with `action_id`, `network_state` tracking
   - `v2_action_logs` - State machine action tracking with database integration

### Key Design Patterns

- **V2 Error Logging**: Fixed data type mismatch with integer `action_id` and enhanced `network_state` collection
- **Keyword-Level Mode Management**: Dynamic switching between `goto` and `search` modes based on blocking patterns
- **Action State Machine**: V2 ActionLogger tracks complex workflows with database integration
- **Anti-Detection**: Multiple bot avoidance techniques (user agent spoofing, WebDriver hiding, viewport randomization)
- **Resource Optimization**: Database-controlled domain filtering with 500KB traffic targets
- **Concurrent Execution**: Isolated browser instances with independent session management

## V2 System Features

### Search Mode Management
- **Dynamic Mode Switching**: Automatic switching between `goto` (URL direct) and `search` (search input) modes
- **Keyword-Level Tracking**: Each keyword maintains its own mode state with ENUM type safety
- **Blocking Pattern Detection**: Automatically switches to search mode after 5 consecutive blocks
- **Rotation System**: Returns to goto mode after 20 successful search executions

### Enhanced Error Logging
- **Action ID Integration**: Fixed data type mismatch between ActionLogger and database
- **Network State Tracking**: Comprehensive network state collection for connection failures
- **Session Isolation**: UUID-based session tracking with cross-reference capabilities
- **Structured Error Data**: Categorized error types with actionable debugging information

### Database Tools (`tools/` directory)
The `tools/` directory now features a **unified management system** (Korean output):
- **Main Tool**: `db-manager.js` - Unified interface replacing 80+ individual scripts
- **Quick Check**: `quick-check.js` - Fast system health check for daily monitoring
- **Core Tools**: Essential tools for V2 table management and migrations
- **Legacy Archive**: `archive/legacy-scripts/` - Individual scripts preserved for reference

**Time-saving approach**: Instead of creating new files for each database task, use the unified `db-manager.js` with category-based commands.

## Configuration

Configuration is hardcoded in `config/environment.js` for single-user deployment:
- Database connection: mkt.techb.kr:5432
- Screen size: 1200x800  
- Timeouts: 30s default, 60s navigation

Proxy configuration is stored in `config/proxies.json` with support for multiple proxy types and authentication.

## Testing Approach

Tests are located in `tests/` directory. The main test file is `chrome-test.js` which validates:
- Browser launch capabilities
- Proxy functionality
- Page navigation
- Anti-detection effectiveness

Run tests with: `node tests/chrome-test.js`

## Development Guidelines

### V2 Error Logging
- All V2 error logging must use `getCurrentActionDbId()` from ActionLoggerV2 to get integer action IDs
- Network state should be collected for connection-related errors
- Use `dbServiceV2.logErrorV2()` for enhanced error tracking with structured data

### Mode Management  
- Use keyword-level mode management through `search-mode-manager.js`
- Mode switching is automatic but can be manually controlled via database
- Monitor mode effectiveness through analysis tools in `tools/` directory

### Database Migrations
- V2 system uses ENUM types for `current_mode` field for data integrity
- Use migration tools in `tools/` directory for schema changes
- Always backup before running migration scripts

## Important Notes

- All user-facing messages and comments are in Korean
- The project interacts with Coupang's website, which may have anti-bot measures  
- V2 system provides enhanced logging and keyword-level mode management
- Database is required for full functionality (PostgreSQL with V2 schema)
- Proxy usage is recommended for production deployments
- Use V2 tools for monitoring and analysis - they provide comprehensive insights into system performance