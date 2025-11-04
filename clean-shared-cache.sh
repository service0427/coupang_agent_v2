#!/bin/bash
# shared-cache 정리 스크립트
# 시간당 1회 실행

CACHE_DIR="/home/tech/coupang_agent_v2/browser-data/shared-cache"
LOG_FILE="/home/tech/coupang_agent_v2/cache-clean.log"

# 현재 시간과 용량 기록
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
BEFORE_SIZE=$(du -sh "$CACHE_DIR" 2>/dev/null | cut -f1)

# 캐시 내용물 삭제 (폴더 구조는 유지)
rm -rf "$CACHE_DIR/Cache/Cache_Data"/* 2>/dev/null
rm -rf "$CACHE_DIR/Code Cache"/* 2>/dev/null
rm -rf "$CACHE_DIR/GPUCache"/* 2>/dev/null
rm -rf "$CACHE_DIR/Service Worker"/* 2>/dev/null
rm -rf "$CACHE_DIR/Shared Dictionary Cache"/* 2>/dev/null

# 정리 후 용량
AFTER_SIZE=$(du -sh "$CACHE_DIR" 2>/dev/null | cut -f1)

# 로그 기록
echo "[$TIMESTAMP] shared-cache 정리: $BEFORE_SIZE -> $AFTER_SIZE" >> "$LOG_FILE"

exit 0
