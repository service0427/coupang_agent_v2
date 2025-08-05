# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Coupang (Korean e-commerce) automation tool built with Node.js and Playwright. The codebase is primarily documented in Korean, focusing on automated product search and browser interaction.

## Essential Commands

### Development Commands
```bash
# Install dependencies and Playwright browser
npm install
npx playwright install chromium

# Run single instance
node index.js

# Run with search optimization
node index.js --search --optimize

# Run multiple concurrent instances (병렬 실행)
node index.js --multi

# Run tests
node tests/chrome-test.js

# Analyze errors from database
node tools/analyze-errors.js
```

### Database Setup
```bash
# Create database tables (Windows)
scripts\create-db.bat

# Or directly with Node.js
node tools/create-db.js
```

## Architecture Overview

### Core Components

1. **Entry Points**
   - `index.js` - Unified execution file supporting both single and multi modes
     - Single mode: Execute one browser instance (default)
     - Multi mode: Execute multiple browser instances in parallel (`--multi` flag)

2. **Browser Automation Layer** (`lib/core/`)
   - `chrome-launcher.js` - Manages Playwright Chrome instances with anti-detection features
   - `optimizer.js` - Implements aggressive domain-based resource filtering for 500KB traffic target

3. **Business Logic** (`lib/handlers/`)
   - `coupang-handler.js` - Main Coupang site automation logic
   - `cart-handler.js` - Shopping cart interaction workflows
   - `product-finder.js` - Product search and selection logic

4. **Service Layer** (`lib/services/`)
   - `db-service.js` - PostgreSQL integration for keyword management and logging
   - `proxy-manager.js` - Proxy rotation and management
   - `error-logger.js` - Centralized error tracking

5. **Network Analysis** (`lib/network/`)
   - `monitor.js` - Real-time network traffic monitoring using CDP
   - `analyzer.js` - Network traffic analysis and reporting
   - `block-analyzer.js` - Blocked resource analysis and optimization insights

6. **Database Schema** (`sql/v2_create_tables.sql`)
   - `v2_test_keywords` - Stores search keywords and execution configuration
   - `v2_execution_logs` - Tracks all execution attempts with metrics
   - `v2_error_logs` - Captures and categorizes errors for analysis

### Key Design Patterns

- **Anti-Detection**: The chrome-launcher implements multiple techniques to avoid bot detection (user agent spoofing, WebDriver hiding, viewport randomization)
- **Resource Optimization**: Database-controlled blocking of images, fonts, and media for faster page loads (optimize column in v2_test_keywords)
- **Proxy Management**: Supports sequential, random, and named proxy selection
- **Error Recovery**: Comprehensive error logging with automatic retry mechanisms
- **Concurrent Execution**: Built-in support for running multiple isolated browser instances

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

## Important Notes

- All user-facing messages and comments are in Korean
- The project interacts with Coupang's website, which may have anti-bot measures
- Database is required for full functionality (PostgreSQL)
- Proxy usage is recommended for production deployments
- Resource optimization significantly improves performance but may affect some site functionality