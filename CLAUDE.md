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
- Connects to hub server: `http://61.84.75.37:3302`
- Multi-threading support (default: 4 threads)
- Task distribution from hub

### Core Components

1. **Entry Point**
   - `index.js` - API mode execution

2. **Core** (`lib/core/`)
   - `api-mode.js` - API mode runner (multi-threading)
   - `browser-core.js` - Playwright Chrome with anti-detection
   - `search-executor.js` - Main search execution
   - `optimizer.js` - Resource optimization
   - `api/` - API mode helper modules
     - `chrome-manager.js` - Chrome version management
     - `error-handler.js` - Error handling with searchMode logic
     - `result-builder.js` - Success response building

3. **Modules** (`lib/modules/`)
   - `coupang-handler.js` - Re-export layer for backward compatibility
   - `api-service.js` - Hub API client
   - `browser-service.js` - Browser lifecycle management
   - `product-detail-handler.js` - Product detail extraction
   - `product/` - Product handling modules
     - `product-list-extractor.js` - Extract product lists from search results
     - `product-click-handler.js` - Find and click target products
     - `cart-handler.js` - Shopping cart operations
   - `search/` - Search handling modules
     - `search-executor.js` - Main search workflow orchestration
     - `search-mode-handler.js` - Search mode switching (main/direct)
     - `pagination-handler.js` - Page navigation with retry logic

4. **Utilities** (`lib/utils/`)
   - `browser-helpers.js` - Browser utility functions
   - `cli-parser.js` - CLI argument parsing
   - `common-helpers.js` - Common helper functions
   - `human-click.js` - Human-like click simulation
   - `ubuntu-setup.js` - Ubuntu-specific setup

## Configuration

- Fixed in `environment.js`
- Screen: 1200x800
- Timeouts: 30s default, 60s navigation

## CLI Options

```
--threads <n>       Thread count (default: 4)
--once              Run once and exit
--keep-browser      Keep browser open on error
--no-gpu            Disable GPU hardware acceleration
--proxy <proxy>     Force proxy (format: host:port:user:pass)
--chrome <version>  Chrome version selection (e.g., 138, 140, 138.0.7204.49)
--direct-url        Direct to search results page (skip main page)
--help              Show help
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