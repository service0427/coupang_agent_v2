#!/bin/bash
#
# Google Chrome - 통합 다운로드 스크립트 (Stable + Testing)
# - Stable: NDViet/google-chrome-stable (deb 패키지)
# - Testing: Chrome for Testing (zip 패키지)
# 121 ~ 최신 버전까지 모든 빌드를 다운로드 (세부 버전 포함)
# 폴더명: chrome-<version>-<type> (예: chrome-140-0-6735-122-1-stable)
#

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# 설정
GITHUB_RELEASES="https://github.com/NDViet/google-chrome-stable/releases/download"
BROWSER_MATRIX_URL="https://raw.githubusercontent.com/NDViet/google-chrome-stable/main/browser-matrix.yml"
CHROME_TESTING_JSON="https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$SCRIPT_DIR/chrome-versions"
TEMP_DIR="/tmp/chrome-downloads"
MIN_VERSION=121

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Google Chrome - Multi-Version Installer${NC}"
echo -e "${BLUE}(Stable + Testing)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 사용법
show_usage() {
    echo -e "${GREEN}Chrome 통합 설치 스크립트${NC}"
    echo
    echo "사용법:"
    echo "  $0                    # 모든 버전 설치 (stable + testing, 121~최신)"
    echo "  $0 list               # 설치 현황 확인"
    echo "  $0 available          # 다운로드 가능한 버전 확인"
    echo "  $0 stable             # stable 버전만 설치"
    echo "  $0 testing            # testing 버전만 설치"
    echo "  $0 latest             # 최신 메이저 버전의 모든 빌드 설치"
    echo "  $0 <메이저>           # 특정 메이저 버전의 모든 빌드 설치 (예: 140)"
    echo "  $0 <전체버전> [type]  # 특정 빌드만 설치 (예: 140.0.6735.122-1 stable)"
    echo
    echo "예시:"
    echo "  $0                        # stable + testing 모든 버전"
    echo "  $0 stable                 # stable만"
    echo "  $0 testing                # testing만"
    echo "  $0 140                    # 140.x.x.x 모든 빌드 (stable + testing)"
    echo "  $0 140.0.6735.122-1       # 해당 버전 (stable + testing)"
    echo "  $0 140.0.6735.122-1 stable # 해당 버전 (stable만)"
    echo
    echo "폴더명 형식:"
    echo "  chrome-140-0-6735-122-1-stable"
    echo "  chrome-140-0-6735-122-testing"
    echo
    exit 0
}

# list 명령 처리
if [ "$1" = "list" ]; then
    echo -e "${BLUE}=== Chrome 버전 현황 ===${NC}"
    echo

    if [ -d "$INSTALL_DIR" ]; then
        stable_count=0
        testing_count=0

        for dir in $(ls -d $INSTALL_DIR/chrome-* 2>/dev/null | sort -V); do
            dirname=$(basename "$dir")

            # stable 버전 (opt/google/chrome/chrome)
            if [[ "$dirname" =~ -stable$ ]] && [ -f "$dir/opt/google/chrome/chrome" ]; then
                version=${dirname#chrome-}
                version=${version%-stable}
                version_display=$(echo "$version" | tr '-' '.')
                echo -e "  ${GREEN}✓${NC} Chrome $version_display ${CYAN}[stable]${NC}"
                ((stable_count++))
            # testing 버전 (chrome-linux64/chrome)
            elif [[ "$dirname" =~ -testing$ ]] && [ -f "$dir/chrome-linux64/chrome" ]; then
                version=${dirname#chrome-}
                version=${version%-testing}
                version_display=$(echo "$version" | tr '-' '.')
                echo -e "  ${YELLOW}✓${NC} Chrome $version_display ${CYAN}[testing]${NC}"
                ((testing_count++))
            fi
        done

        echo
        echo -e "${BLUE}총 $((stable_count + testing_count))개 설치됨 (stable: $stable_count, testing: $testing_count)${NC}"
    else
        echo "  설치된 버전 없음"
    fi
    exit 0
fi

# available 명령 처리
if [ "$1" = "available" ]; then
    echo -e "${BLUE}=== 다운로드 가능한 Chrome 버전 ===${NC}"
    echo

    echo -e "${GREEN}[Stable Versions]${NC}"
    stable_versions=$(curl -s "$BROWSER_MATRIX_URL" | grep "CHROME_VERSION:" | sed 's/.*CHROME_VERSION: //' | sed 's/google-chrome-stable=//' | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n)
    echo "$stable_versions" | awk -v min="$MIN_VERSION" 'BEGIN{FS="."} $1 >= min'
    stable_count=$(echo "$stable_versions" | awk -v min="$MIN_VERSION" 'BEGIN{FS="."} $1 >= min' | wc -l)
    echo -e "${BLUE}Stable: $stable_count versions${NC}"

    echo
    echo -e "${YELLOW}[Testing Versions]${NC}"

    # jq 설치 확인 및 자동 설치
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}jq가 설치되지 않았습니다. 자동 설치를 시도합니다...${NC}"
        if sudo apt-get update && sudo apt-get install -y jq; then
            echo -e "${GREEN}jq 설치 완료${NC}"
        else
            echo -e "${RED}jq 설치 실패. Testing 버전 확인 불가${NC}"
            echo -e "${YELLOW}수동 설치: sudo apt-get install jq${NC}"
        fi
    fi

    if command -v jq &> /dev/null; then
        testing_versions=$(curl -s "$CHROME_TESTING_JSON" | jq -r '.versions[].version' | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n)
        echo "$testing_versions" | awk -v min="$MIN_VERSION" 'BEGIN{FS="."} $1 >= min'
        testing_count=$(echo "$testing_versions" | awk -v min="$MIN_VERSION" 'BEGIN{FS="."} $1 >= min' | wc -l)
        echo -e "${BLUE}Testing: $testing_count versions${NC}"

        echo
        echo -e "${CYAN}Total: $((stable_count + testing_count)) versions${NC}"
    fi
    exit 0
fi

# help 명령 처리
if [ "$1" = "help" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_usage
fi

# 디렉토리 생성
mkdir -p "$INSTALL_DIR"
mkdir -p "$TEMP_DIR"

# 다운로드할 타입 결정
DOWNLOAD_STABLE=true
DOWNLOAD_TESTING=true
SPECIFIC_TYPE=""

if [ "$1" = "stable" ]; then
    DOWNLOAD_TESTING=false
    shift
elif [ "$1" = "testing" ]; then
    DOWNLOAD_STABLE=false
    shift
fi

# ===== Stable 버전 수집 =====
STABLE_VERSIONS=()
if [ "$DOWNLOAD_STABLE" = true ]; then
    echo -e "${YELLOW}Fetching Stable versions from GitHub...${NC}"
    STABLE_LIST=$(curl -s "$BROWSER_MATRIX_URL" | grep "CHROME_VERSION:" | sed 's/.*CHROME_VERSION: //' | sed 's/google-chrome-stable=//')

    if [ -z "$STABLE_LIST" ]; then
        echo -e "${RED}Stable 버전 목록을 가져올 수 없습니다.${NC}"
    else
        while IFS= read -r version; do
            major=$(echo "$version" | cut -d. -f1)
            if [ "$major" -ge "$MIN_VERSION" ] 2>/dev/null; then
                STABLE_VERSIONS+=("$version:stable")
            fi
        done <<< "$STABLE_LIST"
        echo -e "${GREEN}Found ${#STABLE_VERSIONS[@]} stable versions${NC}"
    fi
fi

# ===== Testing 버전 수집 =====
TESTING_VERSIONS=()
if [ "$DOWNLOAD_TESTING" = true ]; then
    echo -e "${YELLOW}Fetching Testing versions from Chrome for Testing...${NC}"

    # jq 설치 확인 및 자동 설치
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}jq가 설치되지 않았습니다. 자동 설치를 시도합니다...${NC}"
        if sudo apt-get update && sudo apt-get install -y jq; then
            echo -e "${GREEN}jq 설치 완료${NC}"
        else
            echo -e "${RED}jq 설치 실패. Testing 버전을 건너뜁니다.${NC}"
            echo -e "${YELLOW}수동 설치: sudo apt-get install jq${NC}"
        fi
    fi

    if command -v jq &> /dev/null; then
        TESTING_JSON=$(curl -s "$CHROME_TESTING_JSON")

        if [ -z "$TESTING_JSON" ]; then
            echo -e "${RED}Testing 버전 목록을 가져올 수 없습니다.${NC}"
        else
            # linux64 chrome 다운로드 URL이 있는 버전만 필터링
            while IFS= read -r line; do
                version=$(echo "$line" | cut -d'|' -f1)
                url=$(echo "$line" | cut -d'|' -f2)

                major=$(echo "$version" | cut -d. -f1)
                if [ "$major" -ge "$MIN_VERSION" ] 2>/dev/null && [ -n "$url" ]; then
                    TESTING_VERSIONS+=("$version:testing:$url")
                fi
            done < <(echo "$TESTING_JSON" | jq -r '.versions[] | "\(.version)|\(.downloads.chrome[]? | select(.platform=="linux64") | .url)"' 2>/dev/null)

            echo -e "${GREEN}Found ${#TESTING_VERSIONS[@]} testing versions${NC}"
        fi
    fi
fi

# ===== 전체 버전 목록 병합 =====
ALL_VERSIONS=("${STABLE_VERSIONS[@]}" "${TESTING_VERSIONS[@]}")

if [ ${#ALL_VERSIONS[@]} -eq 0 ]; then
    echo -e "${RED}다운로드할 버전이 없습니다.${NC}"
    exit 1
fi

# ===== 설치할 버전 필터링 =====
FINAL_VERSIONS=()

# 두 번째 인자로 타입 지정 확인 (예: 140.0.6735.122-1 stable)
if [ -n "$2" ]; then
    if [ "$2" = "stable" ]; then
        SPECIFIC_TYPE="stable"
    elif [ "$2" = "testing" ]; then
        SPECIFIC_TYPE="testing"
    fi
fi

if [ -n "$1" ] && [ "$1" != "latest" ]; then
    TARGET_VERSION="$1"

    # 전체 버전인지 확인 (예: 140.0.6735.122 또는 140.0.6735.122-1)
    if [[ "$TARGET_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(-[0-9]+)?$ ]]; then
        # 전체 버전 지정
        for entry in "${ALL_VERSIONS[@]}"; do
            version=$(echo "$entry" | cut -d':' -f1)
            type=$(echo "$entry" | cut -d':' -f2)

            if [ "$version" = "$TARGET_VERSION" ]; then
                if [ -n "$SPECIFIC_TYPE" ]; then
                    [ "$type" = "$SPECIFIC_TYPE" ] && FINAL_VERSIONS+=("$entry")
                else
                    FINAL_VERSIONS+=("$entry")
                fi
            fi
        done

        if [ ${#FINAL_VERSIONS[@]} -eq 0 ]; then
            echo -e "${RED}Chrome $TARGET_VERSION 버전을 찾을 수 없습니다.${NC}"
            exit 1
        fi
    else
        # 메이저 버전만 지정
        for entry in "${ALL_VERSIONS[@]}"; do
            version=$(echo "$entry" | cut -d':' -f1)
            type=$(echo "$entry" | cut -d':' -f2)
            major=$(echo "$version" | cut -d. -f1)

            if [ "$major" = "$TARGET_VERSION" ]; then
                if [ -n "$SPECIFIC_TYPE" ]; then
                    [ "$type" = "$SPECIFIC_TYPE" ] && FINAL_VERSIONS+=("$entry")
                else
                    FINAL_VERSIONS+=("$entry")
                fi
            fi
        done

        if [ ${#FINAL_VERSIONS[@]} -eq 0 ]; then
            echo -e "${RED}Chrome $TARGET_VERSION 메이저 버전을 찾을 수 없습니다.${NC}"
            exit 1
        fi
    fi
elif [ "$1" = "latest" ]; then
    # 최신 메이저 버전 찾기
    LATEST_MAJOR=0
    for entry in "${ALL_VERSIONS[@]}"; do
        version=$(echo "$entry" | cut -d':' -f1)
        major=$(echo "$version" | cut -d. -f1)
        if [ "$major" -gt "$LATEST_MAJOR" ]; then
            LATEST_MAJOR=$major
        fi
    done

    for entry in "${ALL_VERSIONS[@]}"; do
        version=$(echo "$entry" | cut -d':' -f1)
        major=$(echo "$version" | cut -d. -f1)
        if [ "$major" = "$LATEST_MAJOR" ]; then
            FINAL_VERSIONS+=("$entry")
        fi
    done
else
    # 모든 버전
    FINAL_VERSIONS=("${ALL_VERSIONS[@]}")
fi

TOTAL=${#FINAL_VERSIONS[@]}
if [ "$TOTAL" -eq 0 ]; then
    echo -e "${RED}설치할 버전이 없습니다.${NC}"
    exit 1
fi

# 버전 정렬 (stable, testing 순서로 정렬)
IFS=$'\n' FINAL_VERSIONS=($(printf '%s\n' "${FINAL_VERSIONS[@]}" | sort -t':' -k1,1V -k2,2))
unset IFS

# 첫 번째와 마지막 버전 정보
first_version=$(echo "${FINAL_VERSIONS[0]}" | cut -d':' -f1)
last_version=$(echo "${FINAL_VERSIONS[$((TOTAL-1))]}" | cut -d':' -f1)
first_major=$(echo "$first_version" | cut -d. -f1)
last_major=$(echo "$last_version" | cut -d. -f1)

echo -e "\n${BLUE}Installing $TOTAL build(s)${NC}"
echo -e "${BLUE}Range: Chrome $first_major ($first_version) ~ Chrome $last_major ($last_version)${NC}\n"

SUCCESS=0
FAILED=0
SKIPPED=0

# ===== 설치 루프 =====
for i in "${!FINAL_VERSIONS[@]}"; do
    entry="${FINAL_VERSIONS[$i]}"
    version=$(echo "$entry" | cut -d':' -f1)
    type=$(echo "$entry" | cut -d':' -f2)
    download_url=$(echo "$entry" | cut -d':' -f3-)

    major=$(echo "$version" | cut -d. -f1)
    idx=$((i + 1))

    # 버전 형식 변환: 점 → 하이픈 (예: 140.0.6735.122-1 → 140-0-6735-122-1)
    version_hyphen=$(echo "$version" | tr '.' '-')

    install_path="$INSTALL_DIR/chrome-${version_hyphen}-${type}"

    if [ "$type" = "stable" ]; then
        chrome_binary="$install_path/opt/google/chrome/chrome"
        type_display="${GREEN}stable${NC}"
    else
        chrome_binary="$install_path/chrome-linux64/chrome"
        type_display="${YELLOW}testing${NC}"
    fi

    echo -e "${BLUE}[$idx/$TOTAL]${NC} Chrome $major ($version) [${type_display}${NC}]"

    # 이미 설치되어 있는지 확인
    if [ -f "$chrome_binary" ]; then
        echo -e "  ${YELLOW}Already installed, skipping${NC}"
        ((SKIPPED++))
        continue
    fi

    # ===== Stable 버전 다운로드 =====
    if [ "$type" = "stable" ]; then
        # 다운로드 URL 생성
        download_url="$GITHUB_RELEASES/$version/google-chrome-stable_${version}_amd64.deb"
        deb_path="$TEMP_DIR/chrome-$version.deb"

        echo "  Downloading stable..."
        if ! curl -L -s -o "$deb_path" "$download_url"; then
            echo -e "  ${RED}✗ Download failed${NC}"
            ((FAILED++))
            continue
        fi

        # 파일 크기 확인 (최소 50MB)
        file_size=$(stat -c%s "$deb_path" 2>/dev/null || echo 0)
        if [ "$file_size" -lt 50000000 ]; then
            echo -e "  ${RED}✗ Invalid file (size: $file_size bytes)${NC}"
            rm -f "$deb_path"
            ((FAILED++))
            continue
        fi

        # deb 패키지 압축 해제
        echo "  Extracting..."
        mkdir -p "$install_path"

        cd "$TEMP_DIR"
        ar x "$deb_path" 2>/dev/null

        if [ -f "data.tar.xz" ]; then
            tar -xf data.tar.xz -C "$install_path"
            rm -f data.tar.xz control.tar.* debian-binary
        elif [ -f "data.tar.zst" ]; then
            zstd -d data.tar.zst -o data.tar 2>/dev/null
            tar -xf data.tar -C "$install_path"
            rm -f data.tar.zst data.tar control.tar.* debian-binary
        else
            echo -e "  ${RED}✗ Unknown deb format${NC}"
            rm -f "$deb_path"
            ((FAILED++))
            cd - > /dev/null
            continue
        fi

        rm -f "$deb_path"
        cd - > /dev/null

    # ===== Testing 버전 다운로드 =====
    else
        zip_path="$TEMP_DIR/chrome-$version-testing.zip"

        echo "  Downloading testing..."
        if ! curl -L -s -o "$zip_path" "$download_url"; then
            echo -e "  ${RED}✗ Download failed${NC}"
            ((FAILED++))
            continue
        fi

        # 파일 크기 확인 (최소 50MB)
        file_size=$(stat -c%s "$zip_path" 2>/dev/null || echo 0)
        if [ "$file_size" -lt 50000000 ]; then
            echo -e "  ${RED}✗ Invalid file (size: $file_size bytes)${NC}"
            rm -f "$zip_path"
            ((FAILED++))
            continue
        fi

        # zip 압축 해제
        echo "  Extracting..."
        mkdir -p "$install_path"

        if ! unzip -q "$zip_path" -d "$install_path"; then
            echo -e "  ${RED}✗ Extraction failed${NC}"
            rm -f "$zip_path"
            rm -rf "$install_path"
            ((FAILED++))
            continue
        fi

        rm -f "$zip_path"
    fi

    # 설치 확인
    if [ -f "$chrome_binary" ]; then
        installed_version=$("$chrome_binary" --version 2>/dev/null | awk '{print $NF}' || echo "$version")
        echo -e "  ${GREEN}✓ Installed: Chrome $installed_version [$type]${NC}"
        ((SUCCESS++))
    else
        echo -e "  ${RED}✗ Installation failed (binary not found)${NC}"
        rm -rf "$install_path"
        ((FAILED++))
    fi
done

# 결과 요약
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Installation Complete${NC}"
echo -e "${GREEN}Success: $SUCCESS, Skipped: $SKIPPED, Failed: $FAILED${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\n${BLUE}Chrome installations: $INSTALL_DIR${NC}"
echo -e "${BLUE}설치 확인: ./install-chrome-all.sh list${NC}"
