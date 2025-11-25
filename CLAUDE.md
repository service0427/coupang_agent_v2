# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Coupang (Korean e-commerce) automation tool built with Node.js and Playwright. V2 architecture is a complete rewrite focused on:
- **67% file reduction** (71 → 23 files)
- **API-only mode**: Connects to hub server at `http://61.84.75.37:3302`
- **Multi-threading**: Default 4 threads, distributes tasks from hub
- **Anti-detection**: Headless mode strictly disabled due to TLS blocking on Ubuntu

## Essential Commands

```bash
# Install dependencies
npm install
npx playwright install chromium

# For Ubuntu: Install Chrome dependencies
sudo apt-get update
sudo apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 \
  libgbm1 libpango-1.0-0 libcairo2 libasound2

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

## Key Technical Details

### Search Execution Flow
1. **Task Assignment**: Hub server provides keyword + proxy + target product
2. **Search Modes**:
   - `goto`: Direct URL navigation to search results
   - `search`: Uses Coupang's search box (main page → search)
   - `auto`: Automatic mode switching based on performance
3. **Search Process**:
   - Navigate to Coupang (main or direct to results)
   - Execute search or navigate to search URL
   - Extract product list
   - Find target product by clicking through pages
   - Navigate to product detail page
   - Extract product information
   - Submit results to hub

### Browser Management
- **Persistent profiles**: Each thread maintains its own browser profile in `browser-data/`
- **Profile cleanup**: `cleanChromeProfile()` removes transient session data while preserving shared cache
- **SharedCache**: Cookies/localStorage shared across threads, managed by `SharedCacheManager`
- **Chrome process management**: Profiles killed and reused to prevent memory leaks
- **Window positioning**: `calculateWindowPosition()` tiles browser windows based on screen resolution

### Anti-Detection Mechanisms
- Human-like click simulation (`human-click.js`, `human-behavior.js`)
- Random delays between actions
- Multiple Chrome versions available via `--chrome` flag
- GPU rendering enabled (headless disabled)
- Persistent browser profiles with cookies/localStorage

### Error Handling & Status Codes
- **HTTP-style status codes**: Execution results mapped to HTTP codes (200=success, 403=blocked, etc.)
- **Status tracking**: Two-level system - `ActionStatus` (individual actions) and `ExecutionStatus` (overall workflow)
- See `lib/constants.js` for complete status code mappings
- Hub API expects specific error response format with `status_code` and `error_message`

### Proxy Handling
- Proxies assigned by hub server
- Format: `host:port:username:password`
- Local IP detection (192.168.x.x) triggers proxy error response
- Proxy errors reported with status code 407

## Development Workflow

### Making Changes
1. **Never modify browser-core.js headless settings** - This is the #1 rule
2. Use existing utilities in `lib/utils/` before creating new ones
3. All API responses go through `result-builder.js` and `error-handler.js`
4. Test with `--once --threads 1 --keep-browser` for debugging
5. Check hub API compatibility when modifying response structures

### Common Tasks
- **Add new product extraction logic**: Modify `lib/modules/product-detail-handler.js`
- **Change search behavior**: Update `lib/modules/search/search-executor.js`
- **Adjust timeouts**: Edit `environment.js` (defaultTimeout, navigationTimeout)
- **Browser arguments**: Only modify in `browser-core.js` launchPersistentContext() - currently uses `--disable-blink-features=AutomationControlled` and `--no-sandbox` only

### Debugging
- Use `--keep-browser` to prevent browser closure on errors
- Check browser console logs via Playwright's CDP
- Hub API logs task assignments and results
- Thread-specific logs show `[Thread N]` prefix