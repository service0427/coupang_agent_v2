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
    echo -e "${GREEN}Chrome 설치 스크립트${NC}"
    echo
    echo "사용법:"
    echo "  $0           # 모든 버전 설치"
    echo "  $0 list      # 설치 현황 확인"
    echo
    echo "선택적 옵션:"
    echo "  $0 <버전>    # 특정 버전 설치 (예: 140.207)"
    echo "  $0 latest    # 최신 Chrome만 설치"
    echo
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
    local DEB_FILE="/tmp/chrome-${BUILD}.deb"
    local EXTRACT_DIR="$CHROME_BASE_DIR/chrome-${BUILD//./-}"

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

# 설치 가능한 버전 목록 (빌드 번호별 세부 버전 포함)
declare -A CHROME_VERSIONS=(
    # Chrome 121 버전들
    ["121.85"]="121.0.6167.85"
    ["121.139"]="121.0.6167.139"
    ["121.184"]="121.0.6167.184"

    # Chrome 122 버전들
    ["122.39"]="122.0.6261.39"
    ["122.94"]="122.0.6261.94"
    ["122.111"]="122.0.6261.111"

    # Chrome 123 버전들
    ["123.58"]="123.0.6312.58"
    ["123.86"]="123.0.6312.86"
    ["123.122"]="123.0.6312.122"

    # Chrome 124 버전들
    ["124.60"]="124.0.6367.60"
    ["124.118"]="124.0.6367.118"
    ["124.207"]="124.0.6367.207"

    # Chrome 125 버전들
    ["125.60"]="125.0.6422.60"
    ["125.112"]="125.0.6422.112"
    ["125.141"]="125.0.6422.141"

    # Chrome 126 버전들
    ["126.55"]="126.0.6478.55"
    ["126.114"]="126.0.6478.114"
    ["126.126"]="126.0.6478.126"

    # Chrome 127 버전들
    ["127.72"]="127.0.6533.72"
    ["127.99"]="127.0.6533.99"
    ["127.119"]="127.0.6533.119"

    # Chrome 128 버전들
    ["128.84"]="128.0.6613.84"
    ["128.113"]="128.0.6613.113"
    ["128.119"]="128.0.6613.119"
    ["128.137"]="128.0.6613.137"

    # Chrome 129 버전들
    ["129.58"]="129.0.6668.58"
    ["129.70"]="129.0.6668.70"
    ["129.89"]="129.0.6668.89"
    ["129.100"]="129.0.6668.100"

    # Chrome 130 버전들
    ["130.58"]="130.0.6723.58"
    ["130.69"]="130.0.6723.69"
    ["130.91"]="130.0.6723.91"
    ["130.116"]="130.0.6723.116"

    # Chrome 131 버전들
    ["131.85"]="131.0.6778.85"
    ["131.108"]="131.0.6778.108"
    ["131.139"]="131.0.6778.139"
    ["131.204"]="131.0.6778.204"
    ["131.264"]="131.0.6778.264"

    # Chrome 132 버전들
    ["132.83"]="132.0.6834.83"
    ["132.110"]="132.0.6834.110"
    ["132.159"]="132.0.6834.159"

    # Chrome 133 버전들
    ["133.98"]="133.0.6943.98"
    ["133.116"]="133.0.6943.116"
    ["133.141"]="133.0.6943.141"

    # Chrome 134 버전들
    ["134.117"]="134.0.6998.117"
    ["134.137"]="134.0.6998.137"
    ["134.165"]="134.0.6998.165"

    # Chrome 135 버전들
    ["135.95"]="135.0.7049.95"
    ["135.114"]="135.0.7049.114"

    # Chrome 136 버전들
    ["136.92"]="136.0.7103.92"
    ["136.113"]="136.0.7103.113"

    # Chrome 137 버전들
    ["137.95"]="137.0.7151.95"
    ["137.119"]="137.0.7151.119"

    # Chrome 138 버전들
    ["138.49"]="138.0.7204.49"
    ["138.100"]="138.0.7204.100"
    ["138.183"]="138.0.7204.183"

    # Chrome 139 버전들
    ["139.105"]="139.0.7258.105"
    ["139.135"]="139.0.7258.135"
    ["139.154"]="139.0.7258.154"

    # Chrome 140 버전들
    ["140.111"]="140.0.7339.111"
    ["140.185"]="140.0.7339.185"
    ["140.207"]="140.0.7339.207"
    ["140.240"]="140.0.7339.240"

    # Chrome 141 버전들
    ["141.54"]="141.0.7390.54"
    ["141.55"]="141.0.7390.55"
    ["141.69"]="141.0.7390.69"
)

# 메인 처리
if [ $# -eq 0 ]; then
    # 인수 없이 실행하면 모든 버전 설치
    ACTION="all"
else
    ACTION="$1"
fi

case "$ACTION" in
    list)
        echo -e "${CYAN}=== Chrome 버전 현황 ===${NC}"
        echo

        # 설치된 버전 확인ㄴㄴ
        echo -e "${GREEN}✓ 설치된 버전:${NC}"
        if [ -d "$CHROME_BASE_DIR" ]; then
            installed_count=0
            for dir in $(ls -d $CHROME_BASE_DIR/chrome-* 2>/dev/null | sort -V); do
                if [ -f "$dir/opt/google/chrome/chrome" ]; then
                    dirname=$(basename "$dir")
                    version_file="$dir/VERSION"
                    if [ -f "$version_file" ]; then
                        version=$(cat "$version_file")
                        echo "  - $dirname (버전: $version)"
                    else
                        echo "  - $dirname"
                    fi
                    ((installed_count++))
                fi
            done
            echo -e "${CYAN}  총 ${installed_count}개 설치됨${NC}"
        else
            echo "  설치된 버전 없음"
        fi

        echo

        # 설치 가능한 버전 확인
        echo -e "${YELLOW}○ 설치 가능한 버전 (미설치):${NC}"
        not_installed_count=0
        for version in $(echo "${!CHROME_VERSIONS[@]}" | tr ' ' '\n' | sort -V); do
            build="${CHROME_VERSIONS[$version]}"
            check_dir="$CHROME_BASE_DIR/chrome-${build//./-}"
            if [ ! -d "$check_dir" ] || [ ! -f "$check_dir/opt/google/chrome/chrome" ]; then
                echo "  - Chrome $version: $build"
                ((not_installed_count++))
            fi
        done

        if [ $not_installed_count -eq 0 ]; then
            echo -e "${GREEN}  모든 버전이 설치되어 있습니다!${NC}"
        else
            echo -e "${YELLOW}  ${not_installed_count}개 버전 추가 설치 가능${NC}"
            echo
            echo -e "${CYAN}설치 방법: ./install-chrome.sh${NC}"
        fi
        ;;

    major)
        if [ -z "$2" ]; then
            echo -e "${RED}메이저 버전 번호를 지정해주세요${NC}"
            echo "예: $0 major 140"
            exit 1
        fi
        MAJOR=$2
        echo -e "${GREEN}Chrome $MAJOR 메이저 버전의 모든 빌드 설치 시작${NC}"
        echo

        COUNT=0
        for version in $(echo "${!CHROME_VERSIONS[@]}" | tr ' ' '\n' | sort -V); do
            if [[ $version == $MAJOR.* ]]; then
                echo -e "${CYAN}Chrome ${CHROME_VERSIONS[$version]} 설치 시도...${NC}"
                install_chrome "$version" "${CHROME_VERSIONS[$version]}"
                ((COUNT++))
                echo
            fi
        done

        if [ $COUNT -eq 0 ]; then
            echo -e "${YELLOW}Chrome $MAJOR 버전을 찾을 수 없습니다${NC}"
        else
            echo -e "${GREEN}Chrome $MAJOR 메이저 버전 설치 완료 (총 $COUNT개)${NC}"
        fi
        ;;

    latest)
        echo -e "${GREEN}최신 Chrome 설치${NC}"
        CHROME_URL="https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
        DEB_FILE="/tmp/chrome-latest.deb"

        echo "  다운로드: $CHROME_URL"
        if wget -q -O "$DEB_FILE" "$CHROME_URL"; then
            TEMP_DIR="/tmp/chrome-temp-$$"
            mkdir -p "$TEMP_DIR"
            cd "$TEMP_DIR"
            ar x "$DEB_FILE"
            tar -xf control.tar.* ./control 2>/dev/null

            VERSION=$(grep "^Version:" control | awk '{print $2}' | cut -d'-' -f1)
            EXTRACT_DIR="$CHROME_BASE_DIR/chrome-${VERSION//./-}"

            if [ ! -d "$EXTRACT_DIR" ]; then
                mkdir -p "$EXTRACT_DIR"
                cd "$EXTRACT_DIR"
                ar x "$DEB_FILE"
                tar -xf data.tar.*
                rm -f control.tar.* data.tar.* debian-binary
                echo "$VERSION" > "$EXTRACT_DIR/VERSION"

                echo -e "${GREEN}✓ Chrome $VERSION 설치 완료${NC}"
                echo "  경로: $EXTRACT_DIR"
            else
                echo -e "${YELLOW}Chrome $VERSION은 이미 설치되어 있습니다${NC}"
            fi

            rm -rf "$TEMP_DIR"
            rm -f "$DEB_FILE"
        else
            echo -e "${RED}Chrome 다운로드 실패${NC}"
        fi
        ;;

    all)
        echo -e "${GREEN}Chrome 모든 버전 설치 시작${NC}"
        echo -e "${YELLOW}참고: 구버전은 다운로드 불가능할 수 있어 최신 버전으로 대체됩니다${NC}"
        echo

        # 모든 버전 설치 시도
        for version in $(echo "${!CHROME_VERSIONS[@]}" | tr ' ' '\n' | sort -n); do
            echo
            echo -e "${CYAN}Chrome $version 설치 시도...${NC}"

            # 버전별 설치 함수 호출
            install_chrome "$version" "${CHROME_VERSIONS[$version]}"
        done

        echo

        # 추가로 최신 Chrome도 설치
        echo -e "${BLUE}최신 Chrome 설치 중...${NC}"
        CHROME_URL="https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
        DEB_FILE="/tmp/chrome-current.deb"

        echo "  다운로드: $CHROME_URL"
        if wget -q -O "$DEB_FILE" "$CHROME_URL"; then
            # 버전 추출을 위한 임시 압축 해제
            TEMP_DIR="/tmp/chrome-temp-$$"
            mkdir -p "$TEMP_DIR"
            cd "$TEMP_DIR"
            ar x "$DEB_FILE"
            tar -xf control.tar.* ./control 2>/dev/null || tar -xf control.tar.* control 2>/dev/null

            # 버전 정보 추출
            VERSION=$(grep "^Version:" control | awk '{print $2}' | cut -d'-' -f1)
            MAJOR_VERSION=$(echo $VERSION | cut -d. -f1)

            echo -e "${CYAN}  감지된 버전: Chrome $VERSION (메이저: $MAJOR_VERSION)${NC}"

            # 실제 설치
            EXTRACT_DIR="$CHROME_BASE_DIR/chrome-${VERSION//./-}"

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
        echo -e "${GREEN}모든 설치 작업 완료!${NC}"
        ;;

    [0-9]*)
        # 숫자로 시작하는 버전 (예: 140.207, 138.183 등)
        if [ -z "${CHROME_VERSIONS[$1]}" ]; then
            echo -e "${RED}지원하지 않는 버전: Chrome $1${NC}"
            echo
            echo "설치 가능한 버전 확인: $0 list"
            echo "메이저 버전별 설치: $0 major <숫자>"
            exit 1
        fi
        install_chrome "$1" "${CHROME_VERSIONS[$1]}"
        ;;

    *)
        # 그 외의 경우 버전 키로 직접 시도
        if [ ! -z "${CHROME_VERSIONS[$1]}" ]; then
            install_chrome "$1" "${CHROME_VERSIONS[$1]}"
        else
            show_usage
        fi
        ;;
esac

echo
echo -e "${GREEN}완료!${NC} 설치 현황 확인: ./install-chrome.sh list"