#!/bin/bash

# 무한 루프 실행 스크립트
# 한번 성공하면 3초 쉬고 구동한다

echo "🚀 무한 루프 실행 시작"
echo "📍 성공 시 3초 대기 후 재실행"
echo "📍 Ctrl+C를 눌러 종료하세요"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 실행 카운터
SUCCESS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0

# 무한 루프
while true; do
    TOTAL_COUNT=$((TOTAL_COUNT + 1))
    echo ""
    echo "🔄 실행 #$TOTAL_COUNT (성공: $SUCCESS_COUNT, 실패: $FAIL_COUNT)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # API 모드로 실행 (4개 스레드, 한 번만)
    node index.js --api --instance 1 --threads 4 --once
    
    # 종료 코드 확인
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        echo "✅ 실행 성공 (총 $SUCCESS_COUNT회)"
        echo "⏳ 3초 대기 중..."
        sleep 3
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        echo "❌ 실행 실패 (종료 코드: $EXIT_CODE)"
        echo "⏳ 1초 후 재시도..."
        sleep 1
    fi
done