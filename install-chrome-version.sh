#!/bin/bash
# Chrome 버전별 설치 스크립트 (배포용)
# 사용법: ./install-chrome-version.sh [버전]
# 예시: ./install-chrome-version.sh 128
#      ./install-chrome-version.sh 130
#      ./install-chrome-version.sh all

CHROME_BASE_DIR="$HOME/chrome-versions"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 사용법 출력
show_usage() {
    echo -e "${GREEN}Chrome 버전 설치 스크립트${NC}"
    echo
    echo "사용법:"
    echo "  $0 <버전>    # 특정 버전 설치"
    echo "  $0 all       # 모든 버전 설치 (128-140)"
    echo "  $0 list      # 설치 가능한 버전 목록"
    echo
    echo "예시:"
    echo "  $0 128       # Chrome 128 설치"
    echo "  $0 130       # Chrome 130 설치"
    echo "  $0 138       # Chrome 138 설치"
    echo
    echo "설치된 Chrome 버전 확인:"
    echo "  ls -la ~/chrome-versions/"
    exit 0
}

# Chrome 버전 설치 함수
install_chrome() {
    local VERSION=$1
    local BUILD=$2

    echo -e "${BLUE}Chrome $VERSION 설치 중...${NC}"

    # 디렉토리 생성
    mkdir -p "$CHROME_BASE_DIR"

    # Chrome 다운로드 및 설치 (구버전은 실패할 수 있으므로 current URL도 시도)
    local CHROME_URL="https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_${BUILD}_amd64.deb"
    local DEB_FILE="/tmp/chrome-${VERSION}.deb"
    local EXTRACT_DIR="$CHROME_BASE_DIR/chrome-${VERSION//./-}"

    # 이미 설치되어 있는지 확인
    if [ -d "$EXTRACT_DIR" ] && [ -f "$EXTRACT_DIR/opt/google/chrome/chrome" ]; then
        echo -e "${YELLOW}Chrome $VERSION은 이미 설치되어 있습니다.${NC}"
        return 0
    fi

    echo "  다운로드: $CHROME_URL"
    if ! wget -q -O "$DEB_FILE" "$CHROME_URL"; then
        echo -e "${YELLOW}구버전 다운로드 실패. 최신 버전 시도 중...${NC}"

        # 최신 Chrome 다운로드 시도
        CHROME_URL="https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
        echo "  다운로드: $CHROME_URL (최신 버전)"

        if ! wget -q -O "$DEB_FILE" "$CHROME_URL"; then
            echo -e "${RED}다운로드 실패: Chrome $VERSION${NC}"
            return 1
        fi

        echo -e "${GREEN}최신 Chrome 다운로드 성공${NC}"
    fi

    # DEB 파일 추출
    echo "  압축 해제 중..."
    mkdir -p "$EXTRACT_DIR"
    cd "$EXTRACT_DIR"
    ar x "$DEB_FILE"
    tar -xf data.tar.xz
    rm -f control.tar.* data.tar.xz debian-binary "$DEB_FILE"

    # VERSION 파일 생성
    echo "$BUILD" > "$EXTRACT_DIR/VERSION"

    # 실행 파일 확인
    if [ -f "$EXTRACT_DIR/opt/google/chrome/chrome" ]; then
        echo -e "${GREEN}✓ Chrome $VERSION 설치 완료${NC}"
        echo "  경로: $EXTRACT_DIR"
    else
        echo -e "${RED}✗ Chrome $VERSION 설치 실패${NC}"
        return 1
    fi
}

# 설치 가능한 버전 목록
declare -A CHROME_VERSIONS=(
    ["128"]="128.0.6613.137"
    ["129"]="129.0.6668.89"
    ["130"]="130.0.6723.116"
    ["131"]="131.0.6778.264"
    ["132"]="132.0.6834.159"
    ["133"]="133.0.6943.141"
    ["134"]="134.0.6998.165"
    ["135"]="135.0.7049.114"
    ["136"]="136.0.7103.113"
    ["137"]="137.0.7151.119"
    ["138"]="138.0.7204.183"
    ["139"]="139.0.7258.154"
    ["140"]="140.0.7339.185"
)

# 메인 처리
if [ $# -eq 0 ]; then
    show_usage
fi

case "$1" in
    list)
        echo -e "${CYAN}설치 가능한 Chrome 버전:${NC}"
        for version in $(echo "${!CHROME_VERSIONS[@]}" | tr ' ' '\n' | sort -n); do
            echo "  Chrome $version: ${CHROME_VERSIONS[$version]}"
        done
        ;;

    all)
        echo -e "${GREEN}Chrome 설치 시작${NC}"
        echo -e "${YELLOW}참고: 구버전은 다운로드 불가능할 수 있어 최신 버전을 설치합니다${NC}"
        echo

        # 최신 Chrome 설치
        echo -e "${BLUE}최신 Chrome 설치 중...${NC}"
        local CHROME_URL="https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
        local DEB_FILE="/tmp/chrome-current.deb"

        echo "  다운로드: $CHROME_URL"
        if wget -q -O "$DEB_FILE" "$CHROME_URL"; then
            # 버전 추출을 위한 임시 압축 해제
            local TEMP_DIR="/tmp/chrome-temp-$$"
            mkdir -p "$TEMP_DIR"
            cd "$TEMP_DIR"
            ar x "$DEB_FILE"
            tar -xf control.tar.* ./control 2>/dev/null || tar -xf control.tar.* control 2>/dev/null

            # 버전 정보 추출
            local VERSION=$(grep "^Version:" control | awk '{print $2}' | cut -d'-' -f1)
            local MAJOR_VERSION=$(echo $VERSION | cut -d. -f1)

            echo -e "${CYAN}  감지된 버전: Chrome $VERSION (메이저: $MAJOR_VERSION)${NC}"

            # 실제 설치
            local EXTRACT_DIR="$CHROME_BASE_DIR/chrome-${VERSION//./-}"

            if [ ! -d "$EXTRACT_DIR" ]; then
                mkdir -p "$EXTRACT_DIR"
                cd "$EXTRACT_DIR"
                ar x "$DEB_FILE"
                tar -xf data.tar.*
                rm -f control.tar.* data.tar.* debian-binary

                # VERSION 파일 생성
                echo "$VERSION" > "$EXTRACT_DIR/VERSION"

                if [ -f "$EXTRACT_DIR/opt/google/chrome/chrome" ]; then
                    echo -e "${GREEN}✓ Chrome $VERSION 설치 완료${NC}"
                    echo "  경로: $EXTRACT_DIR"
                else
                    echo -e "${RED}✗ Chrome $VERSION 설치 실패${NC}"
                fi
            else
                echo -e "${YELLOW}Chrome $VERSION은 이미 설치되어 있습니다${NC}"
            fi

            # 정리
            rm -rf "$TEMP_DIR"
            rm -f "$DEB_FILE"
        else
            echo -e "${RED}Chrome 다운로드 실패${NC}"
        fi

        echo
        echo -e "${GREEN}설치 완료!${NC}"
        ;;

    [0-9]*)
        if [ -z "${CHROME_VERSIONS[$1]}" ]; then
            echo -e "${RED}지원하지 않는 버전: Chrome $1${NC}"
            echo "설치 가능한 버전: ${!CHROME_VERSIONS[@]}"
            exit 1
        fi
        install_chrome "$1" "${CHROME_VERSIONS[$1]}"
        ;;

    *)
        show_usage
        ;;
esac

echo
echo -e "${CYAN}설치 완료 후 사용법:${NC}"
echo "  node index.js --threads 1 --once"
echo
echo -e "${CYAN}설치된 버전 확인:${NC}"
echo "  ls -la ~/chrome-versions/"