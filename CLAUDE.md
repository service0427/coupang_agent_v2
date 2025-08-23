# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Coupang (Korean e-commerce) automation tool built with Node.js and Playwright. V2 API-based architecture only.

## Essential Commands

```bash
# Install dependencies
npm install
npx playwright install chromium

# Run API mode (main execution)
node index.js --threads 4 --once    # Single execution
node index.js --threads 4           # Continuous mode
```

## Architecture

### API Mode Only
- Connects to hub server: `http://mkt.techb.kr:3001`
- Multi-threading support
- Task distribution from hub

### Core Components

1. **Entry Point**
   - `index.js` - API mode execution

2. **Core** (`lib/core/`)
   - `chrome-launcher.js` - Playwright Chrome with anti-detection
   - `search-executor.js` - Main search execution
   - `optimizer.js` - Resource optimization

3. **Handlers** (`lib/handlers/`)
   - `coupang-handler.js` - Main automation logic
   - `product-finder.js` - Product search
   - `cart-handler.js` - Cart handling
   - `pagination-handler.js` - Page navigation
   - `search-mode-handler.js` - Search mode switching

4. **Services** (`lib/services/`)
   - `hub-api-client.js` - Hub server communication
   - `browser-manager.js` - Browser lifecycle
   - `shared-cache-manager.js` - Cache management

5. **Utilities** (`lib/utils/`)
   - Browser helpers
   - Session management
   - Window positioning

## Configuration

- Fixed in `environment.js`
- Screen: 1200x800
- Timeouts: 30s default, 60s navigation

## CLI Options

```
--threads <n>       Thread count (default: 4)
--once             Run once and exit
--monitor          Enable traffic monitoring
--check-cookies    Track cookie changes
--keep-browser     Keep browser open on error
```

## ⚠️⚠️⚠️ ABSOLUTE RULES - NEVER BREAK ⚠️⚠️⚠️

### HEADLESS MODE = INSTANT BLOCK
- **NEVER** set headless to true
- **NEVER** modify headless-related code in browser-core.js
- **ALWAYS** keep headless=false (TLS error on Ubuntu = instant Coupang block)
- **DO NOT** attempt to "optimize" or "fix" headless settings
- This is NOT negotiable - breaking this rule makes the entire system unusable

## CRITICAL CODE MODIFICATION RULES

### NEVER Add Unnecessary Code
- **DO NOT** add extra functionality when refactoring or merging files
- **DO NOT** modify existing logic unless explicitly fixing a bug
- **DO NOT** add comments, logs, or "improvements" without permission
- **DO NOT** change variable names or function signatures unnecessarily

### When Merging/Consolidating Files
1. **COPY EXACTLY**: Copy code as-is without modifications
2. **PRESERVE LOGIC**: Keep all original logic intact
3. **MAINTAIN STRUCTURE**: Preserve original function order and structure
4. **NO ADDITIONS**: Do not add helper functions, utilities, or "improvements"
5. **SIMPLE MERGE**: Just combine files, nothing more

### Code Refactoring Policy
- **MINIMAL CHANGES**: Only remove genuinely unused code
- **PRESERVE FUNCTIONALITY**: Never break working code
- **ASK FIRST**: When in doubt, ask before making changes
- **TEST AFTER**: Always verify code still works after changes

## Important Notes

- All user-facing messages are in Korean
- Interacts with Coupang's anti-bot measures
- Ubuntu/Linux requires Chrome dependencies
- **CRITICAL**: Never run headless mode on Ubuntu server (TLS error = instant block)
- **TESTING**: Claude cannot execute code directly - all testing done by user