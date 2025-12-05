#!/bin/bash
#
# Google Chrome Stable - 다중 버전 다운로드 스크립트 (DEB 패키지)
# NDViet/google-chrome-stable GitHub 저장소에서 공식 deb 패키지 다운로드
# 121 ~ 최신 버전까지 각 메이저 버전의 최신 빌드를 다운로드
#

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 설정
GITHUB_RELEASES="https://github.com/NDViet/google-chrome-stable/releases/download"
BROWSER_MATRIX_URL="https://raw.githubusercontent.com/NDViet/google-chrome-stable/main/browser-matrix.yml"
INSTALL_DIR="$HOME/chrome-versions"
TEMP_DIR="/tmp/chrome-deb-downloads"
MIN_VERSION=121

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Google Chrome Stable - DEB Package Installer${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 사용법
show_usage() {
    echo -e "${GREEN}Chrome 설치 스크립트 (DEB 패키지)${NC}"
    echo
    echo "사용법:"
    echo "  $0           # 모든 버전 설치 (121~최신)"
    echo "  $0 list      # 설치 현황 확인"
    echo "  $0 available # 다운로드 가능한 버전 확인"
    echo "  $0 latest    # 최신 버전만 설치"
    echo "  $0 <버전>    # 특정 메이저 버전 설치 (예: 140)"
    echo
    exit 0
}

# list 명령 처리
if [ "$1" = "list" ]; then
    echo -e "${BLUE}=== Chrome 버전 현황 ===${NC}"
    echo

    if [ -d "$INSTALL_DIR" ]; then
        installed_count=0
        for dir in $(ls -d $INSTALL_DIR/chrome-* 2>/dev/null | sort -V); do
            # apt 구조 (opt/google/chrome/chrome)
            if [ -f "$dir/opt/google/chrome/chrome" ]; then
                dirname=$(basename "$dir")
                version=${dirname#chrome-}
                echo -e "  ${GREEN}✓${NC} Chrome $version (deb)"
                ((installed_count++))
            # Chrome for Testing 구조 (chrome-linux64/chrome)
            elif [ -f "$dir/chrome-linux64/chrome" ]; then
                dirname=$(basename "$dir")
                version=${dirname#chrome-}
                echo -e "  ${YELLOW}✓${NC} Chrome $version (testing)"
                ((installed_count++))
            fi
        done
        echo
        echo -e "${BLUE}총 ${installed_count}개 설치됨${NC}"
    else
        echo "  설치된 버전 없음"
    fi
    exit 0
fi

# available 명령 처리
if [ "$1" = "available" ]; then
    echo -e "${BLUE}=== 다운로드 가능한 Chrome 버전 ===${NC}"
    echo
    curl -s "$BROWSER_MATRIX_URL" | grep "CHROME_VERSION:" | sed 's/.*CHROME_VERSION: //' | sed 's/google-chrome-stable=//' | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n
    exit 0
fi

# help 명령 처리
if [ "$1" = "help" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_usage
fi

# 디렉토리 생성
mkdir -p "$INSTALL_DIR"
mkdir -p "$TEMP_DIR"

# 버전 목록 가져오기
echo -e "${YELLOW}Fetching Chrome versions from GitHub...${NC}"
VERSION_LIST=$(curl -s "$BROWSER_MATRIX_URL" | grep "CHROME_VERSION:" | sed 's/.*CHROME_VERSION: //' | sed 's/google-chrome-stable=//')

if [ -z "$VERSION_LIST" ]; then
    echo -e "${RED}버전 목록을 가져올 수 없습니다.${NC}"
    exit 1
fi

# 메이저 버전별 최신 빌드 수집
declare -A MAJOR_VERSIONS

while IFS= read -r version; do
    major=$(echo "$version" | cut -d. -f1)
    if [ "$major" -ge "$MIN_VERSION" ] 2>/dev/null; then
        # 해당 메이저 버전이 없거나 현재 버전이 더 최신이면 업데이트
        if [ -z "${MAJOR_VERSIONS[$major]}" ]; then
            MAJOR_VERSIONS[$major]="$version"
        else
            # revision 비교 (마지막 숫자)
            current_rev=$(echo "${MAJOR_VERSIONS[$major]}" | cut -d. -f4 | cut -d- -f1)
            new_rev=$(echo "$version" | cut -d. -f4 | cut -d- -f1)
            if [ "$new_rev" -gt "$current_rev" ] 2>/dev/null; then
                MAJOR_VERSIONS[$major]="$version"
            fi
        fi
    fi
done <<< "$VERSION_LIST"

# 설치할 버전 결정
if [ -n "$1" ] && [ "$1" != "latest" ]; then
    TARGET_VERSION="$1"
    if [ -z "${MAJOR_VERSIONS[$TARGET_VERSION]}" ]; then
        echo -e "${RED}Chrome $TARGET_VERSION 버전을 찾을 수 없습니다${NC}"
        exit 1
    fi
    VERSIONS_TO_INSTALL=("$TARGET_VERSION")
elif [ "$1" = "latest" ]; then
    # 가장 높은 메이저 버전 찾기
    LATEST_MAJOR=$(echo "${!MAJOR_VERSIONS[@]}" | tr ' ' '\n' | sort -n | tail -1)
    VERSIONS_TO_INSTALL=("$LATEST_MAJOR")
else
    # 모든 버전 설치
    VERSIONS_TO_INSTALL=($(echo "${!MAJOR_VERSIONS[@]}" | tr ' ' '\n' | sort -n))
fi

TOTAL=${#VERSIONS_TO_INSTALL[@]}
if [ "$TOTAL" -eq 0 ]; then
    echo -e "${RED}설치할 버전이 없습니다${NC}"
    exit 1
fi

MIN_VER=${VERSIONS_TO_INSTALL[0]}
MAX_VER=${VERSIONS_TO_INSTALL[$((TOTAL-1))]}
echo -e "\n${BLUE}Installing $TOTAL version(s): Chrome $MIN_VER-$MAX_VER${NC}\n"

SUCCESS=0
FAILED=0
SKIPPED=0
UPDATED=0

for i in "${!VERSIONS_TO_INSTALL[@]}"; do
    major="${VERSIONS_TO_INSTALL[$i]}"
    version="${MAJOR_VERSIONS[$major]}"
    idx=$((i + 1))

    # 버전 형식 변환 (점 → 하이픈)
    version_hyphen=$(echo "$version" | tr '.' '-' | sed 's/-1$//')
    install_path="$INSTALL_DIR/chrome-$version_hyphen"
    chrome_binary="$install_path/opt/google/chrome/chrome"

    echo -e "${BLUE}[$idx/$TOTAL] Chrome $major ($version)${NC}"

    # 이미 설치되어 있는지 확인
    existing=""
    existing_rev=0
    for d in $(ls -d "$INSTALL_DIR/chrome-$major"* 2>/dev/null); do
        if [ -f "$d/opt/google/chrome/chrome" ]; then
            existing=$(basename "$d")
            # 기존 버전의 revision 추출
            existing_rev=$(echo "$existing" | sed 's/chrome-//' | tr '-' '.' | cut -d. -f4)
            break
        fi
    done

    # 새 빌드와 비교
    new_rev=$(echo "$version" | cut -d. -f4 | cut -d- -f1)

    if [ -n "$existing" ]; then
        if [ "$new_rev" -le "$existing_rev" ] 2>/dev/null; then
            echo -e "  ${YELLOW}Already up-to-date ($existing), skipping${NC}"
            ((SKIPPED++))
            continue
        else
            echo -e "  ${BLUE}Updating: $existing_rev → $new_rev${NC}"
            rm -rf "$INSTALL_DIR/$existing"
            ((UPDATED++))
        fi
    fi

    # Chrome for Testing 버전이 있으면 삭제
    for d in $(ls -d "$INSTALL_DIR/chrome-$major"* 2>/dev/null); do
        if [ -f "$d/chrome-linux64/chrome" ]; then
            echo -e "  ${YELLOW}Removing Chrome for Testing version...${NC}"
            rm -rf "$d"
        fi
    done

    # 다운로드 URL 생성
    # 형식: https://github.com/NDViet/google-chrome-stable/releases/download/143.0.7499.40-1/google-chrome-stable_143.0.7499.40-1_amd64.deb
    download_url="$GITHUB_RELEASES/$version/google-chrome-stable_${version}_amd64.deb"
    deb_path="$TEMP_DIR/chrome-$version.deb"

    # 다운로드
    echo "  Downloading..."
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

    # data.tar.xz 추출
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
        continue
    fi

    rm -f "$deb_path"
    cd - > /dev/null

    # 설치 확인
    if [ -f "$chrome_binary" ]; then
        # 버전 확인
        installed_version=$("$chrome_binary" --version 2>/dev/null | awk '{print $NF}' || echo "$version")
        echo -e "  ${GREEN}✓ Installed: Chrome $installed_version${NC}"
        ((SUCCESS++))
    else
        echo -e "  ${RED}✗ Installation failed${NC}"
        rm -rf "$install_path"
        ((FAILED++))
    fi
done

# 결과 요약
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Installation Complete${NC}"
echo -e "${GREEN}Success: $SUCCESS, Updated: $UPDATED, Skipped: $SKIPPED, Failed: $FAILED${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\n${BLUE}Chrome installations: $INSTALL_DIR${NC}"
echo -e "${BLUE}설치 확인: ./install-chrome-deb.sh list${NC}"
