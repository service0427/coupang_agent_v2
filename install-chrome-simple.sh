#!/bin/bash
# 간단한 Chrome 설치 스크립트 - 최신 버전만 설치

CHROME_BASE_DIR="$HOME/chrome-versions"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Chrome 최신 버전 자동 설치 스크립트               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo

# 디렉토리 생성
mkdir -p "$CHROME_BASE_DIR"

# 최신 Chrome 다운로드
echo -e "${BLUE}▶ 최신 Chrome 다운로드 중...${NC}"
CHROME_URL="https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
DEB_FILE="/tmp/chrome-latest.deb"

echo "  URL: $CHROME_URL"
if wget --progress=bar:force -O "$DEB_FILE" "$CHROME_URL" 2>&1 | grep -E -o '[0-9]+%|100%' | tail -1; then
    echo -e "${GREEN}  ✓ 다운로드 완료${NC}"
else
    echo -e "${RED}  ✗ 다운로드 실패${NC}"
    echo -e "${YELLOW}  네트워크 연결을 확인하세요.${NC}"
    exit 1
fi

# 버전 정보 추출
echo -e "${BLUE}▶ 버전 정보 확인 중...${NC}"
TEMP_DIR="/tmp/chrome-extract-$$"
mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

# control 파일 추출
ar x "$DEB_FILE" 2>/dev/null
tar -xf control.tar.* 2>/dev/null

# 버전 추출
if [ -f control ]; then
    VERSION=$(grep "^Version:" control | awk '{print $2}' | cut -d'-' -f1)
    MAJOR_VERSION=$(echo $VERSION | cut -d. -f1)
    echo -e "${CYAN}  감지된 버전: Chrome $VERSION (메이저: $MAJOR_VERSION)${NC}"
else
    echo -e "${YELLOW}  버전 정보를 찾을 수 없습니다. 기본값 사용.${NC}"
    VERSION="latest"
    MAJOR_VERSION="latest"
fi

# 설치 디렉토리
EXTRACT_DIR="$CHROME_BASE_DIR/chrome-${VERSION//./-}"

# 기존 설치 확인
if [ -d "$EXTRACT_DIR" ] && [ -f "$EXTRACT_DIR/opt/google/chrome/chrome" ]; then
    echo -e "${YELLOW}▶ Chrome $VERSION이 이미 설치되어 있습니다.${NC}"
    echo "  경로: $EXTRACT_DIR"
else
    # Chrome 설치
    echo -e "${BLUE}▶ Chrome $VERSION 설치 중...${NC}"
    mkdir -p "$EXTRACT_DIR"
    cd "$EXTRACT_DIR"

    echo "  압축 해제 중..."
    ar x "$DEB_FILE"
    tar -xf data.tar.* 2>/dev/null
    rm -f control.tar.* data.tar.* debian-binary

    # VERSION 파일 생성
    echo "$VERSION" > "$EXTRACT_DIR/VERSION"

    # 실행 파일 확인
    if [ -f "$EXTRACT_DIR/opt/google/chrome/chrome" ]; then
        echo -e "${GREEN}  ✓ Chrome $VERSION 설치 완료${NC}"
        echo "  경로: $EXTRACT_DIR"
    else
        echo -e "${RED}  ✗ Chrome 설치 실패${NC}"
        exit 1
    fi
fi

# 심볼릭 링크 생성 (쉬운 접근을 위해)
echo -e "${BLUE}▶ 심볼릭 링크 생성 중...${NC}"
ln -sf "$EXTRACT_DIR" "$CHROME_BASE_DIR/chrome-current"
ln -sf "$EXTRACT_DIR" "$CHROME_BASE_DIR/chrome-$MAJOR_VERSION"
echo -e "${GREEN}  ✓ chrome-current → Chrome $VERSION${NC}"
echo -e "${GREEN}  ✓ chrome-$MAJOR_VERSION → Chrome $VERSION${NC}"

# 정리
rm -rf "$TEMP_DIR"
rm -f "$DEB_FILE"

# 완료 메시지
echo
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                    설치 완료!                              ${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo
echo -e "${CYAN}▶ 설치된 Chrome 정보:${NC}"
echo "  버전: Chrome $VERSION"
echo "  경로: $EXTRACT_DIR"
echo
echo -e "${CYAN}▶ 사용 방법:${NC}"
echo "  # 최신 Chrome으로 실행"
echo "  node index.js --chrome $MAJOR_VERSION --threads 1 --once"
echo
echo "  # 또는 버전 명시"
echo "  node index.js --chrome $VERSION --threads 1 --once"
echo
echo -e "${CYAN}▶ 설치된 모든 Chrome 확인:${NC}"
echo "  ls -la ~/chrome-versions/"
echo
echo -e "${GREEN}Chrome $VERSION이 정상적으로 설치되었습니다!${NC}"