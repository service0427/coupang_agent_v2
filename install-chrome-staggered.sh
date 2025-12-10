#!/bin/bash
#
# Chrome 시차별 설치 스크립트
# - 각 메이저 버전당 1개씩 설치
# - rank 지정 가능 (1=최신, 2=2번째, 3=3번째...)
#

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 설정
CHROME_TESTING_JSON="https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$SCRIPT_DIR/chrome-versions"
TEMP_DIR="/tmp/chrome-staggered"
MIN_VERSION=121

# 사용법
show_usage() {
    echo -e "${GREEN}Chrome 시차별 설치 스크립트${NC}"
    echo
    echo "사용법:"
    echo "  $0 [rank]           # 모든 메이저 버전에 동일한 rank 적용"
    echo "  $0 staggered        # 시차별 (143=rank1, 142=rank2, 141=rank3...)"
    echo "  $0 list             # 설치 현황"
    echo
    echo "예시:"
    echo "  $0                  # 기본: 시차별"
    echo "  $0 1                # 모든 메이저 버전의 최신 빌드"
    echo "  $0 5                # 모든 메이저 버전의 5번째 빌드"
    echo "  $0 staggered        # 시차별 (기본값)"
    echo
    exit 0
}

# help 처리
if [ "$1" = "help" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_usage
fi

# list 처리
if [ "$1" = "list" ]; then
    echo -e "${BLUE}=== Chrome 버전 현황 ===${NC}"
    echo

    if [ -d "$INSTALL_DIR" ]; then
        count=0
        for dir in $(ls -d $INSTALL_DIR/chrome-*-testing 2>/dev/null | sort -V); do
            if [ -f "$dir/chrome-linux64/chrome" ]; then
                dirname=$(basename "$dir")
                version=${dirname#chrome-}
                version=${version%-testing}
                version_display=$(echo "$version" | tr '-' '.')
                echo -e "  ${YELLOW}✓${NC} Chrome $version_display ${CYAN}[testing]${NC}"
                ((count++))
            fi
        done
        echo
        echo -e "${BLUE}총 ${count}개 설치됨${NC}"
    else
        echo "  설치된 버전 없음"
    fi
    exit 0
fi

# rank 모드 결정
RANK_MODE="staggered"
FIXED_RANK=0

if [ -n "$1" ]; then
    if [ "$1" = "staggered" ]; then
        RANK_MODE="staggered"
    elif [[ "$1" =~ ^[0-9]+$ ]]; then
        RANK_MODE="fixed"
        FIXED_RANK=$1
    else
        echo -e "${RED}잘못된 인자: $1${NC}"
        show_usage
    fi
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Chrome Staggered Build Installer${NC}"
if [ "$RANK_MODE" = "staggered" ]; then
    echo -e "${BLUE}Mode: Staggered (시차별)${NC}"
else
    echo -e "${BLUE}Mode: Fixed Rank ${FIXED_RANK}${NC}"
fi
echo -e "${BLUE}========================================${NC}"
echo ""

# jq 설치 확인
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}jq가 설치되지 않았습니다. 자동 설치를 시도합니다...${NC}"
    if sudo apt-get update && sudo apt-get install -y jq; then
        echo -e "${GREEN}jq 설치 완료${NC}"
    else
        echo -e "${RED}jq 설치 실패. 수동 설치: sudo apt-get install jq${NC}"
        exit 1
    fi
fi

# 디렉토리 생성
mkdir -p "$INSTALL_DIR"
mkdir -p "$TEMP_DIR"

echo -e "${YELLOW}Fetching Chrome for Testing versions...${NC}"
TESTING_JSON=$(curl -s "$CHROME_TESTING_JSON")

if [ -z "$TESTING_JSON" ]; then
    echo -e "${RED}버전 목록을 가져올 수 없습니다.${NC}"
    exit 1
fi

# 모든 버전을 배열로 저장 (최신순으로 정렬)
echo -e "${YELLOW}Processing versions...${NC}"

# 버전별로 linux64 다운로드 URL 추출
mapfile -t ALL_VERSIONS < <(echo "$TESTING_JSON" | jq -r '.versions[] | select(.downloads.chrome[]?.platform == "linux64") | "\(.version)|\(.downloads.chrome[] | select(.platform=="linux64") | .url)"' | sort -t'.' -k1,1nr -k2,2nr -k3,3nr -k4,4nr)

if [ ${#ALL_VERSIONS[@]} -eq 0 ]; then
    echo -e "${RED}다운로드 가능한 버전이 없습니다.${NC}"
    exit 1
fi

echo -e "${GREEN}Found ${#ALL_VERSIONS[@]} total versions${NC}"

# 메이저 버전별로 시차별 빌드 선택
declare -A SELECTED_VERSIONS
declare -A USED_INDICES  # 이미 사용된 인덱스 추적

# 최신순으로 정렬된 메이저 버전 목록
MAJOR_VERSIONS=($(echo "$TESTING_JSON" | jq -r '.versions[].version' | cut -d. -f1 | sort -rn | uniq | awk -v min="$MIN_VERSION" '$1 >= min'))

if [ "$RANK_MODE" = "staggered" ]; then
    echo -e "\n${BLUE}Selecting staggered builds:${NC}"
else
    echo -e "\n${BLUE}Selecting rank ${FIXED_RANK} builds:${NC}"
fi

# 각 메이저 버전에 대해 선택
index=0
for major in "${MAJOR_VERSIONS[@]}"; do
    # rank 결정
    if [ "$RANK_MODE" = "staggered" ]; then
        target_rank=$index
    else
        target_rank=$((FIXED_RANK - 1))  # 0-based index
    fi

    # 해당 메이저 버전의 빌드를 3번째 숫자 기준으로 그룹화
    declare -A build_groups
    for i in "${!ALL_VERSIONS[@]}"; do
        version=$(echo "${ALL_VERSIONS[$i]}" | cut -d'|' -f1)
        ver_major=$(echo "$version" | cut -d. -f1)

        if [ "$ver_major" = "$major" ]; then
            # 3번째 숫자 추출 (BUILD 번호)
            build_num=$(echo "$version" | cut -d. -f3)

            # 이 BUILD 번호의 첫 번째 버전만 저장
            if [ -z "${build_groups[$build_num]}" ]; then
                build_groups[$build_num]="${ALL_VERSIONS[$i]}"
            fi
        fi
    done

    # BUILD 번호 기준으로 정렬하고 target_rank번째 선택
    sorted_builds=($(echo "${!build_groups[@]}" | tr ' ' '\n' | sort -rn))

    if [ "${#sorted_builds[@]}" -gt "$target_rank" ]; then
        selected_build="${sorted_builds[$target_rank]}"
        SELECTED_VERSIONS[$major]="${build_groups[$selected_build]}"
        version=$(echo "${build_groups[$selected_build]}" | cut -d'|' -f1)
        echo -e "  ${CYAN}Chrome $major${NC}: $version (rank: $((target_rank + 1)), build: $selected_build)"
    else
        # rank가 너무 높으면 마지막 빌드 선택
        last_idx=$((${#sorted_builds[@]} - 1))
        selected_build="${sorted_builds[$last_idx]}"
        SELECTED_VERSIONS[$major]="${build_groups[$selected_build]}"
        version=$(echo "${build_groups[$selected_build]}" | cut -d'|' -f1)
        echo -e "  ${CYAN}Chrome $major${NC}: $version (rank: $((last_idx + 1))/${#sorted_builds[@]}, build: $selected_build)"
    fi

    # 그룹 초기화
    unset build_groups

    # staggered 모드에서만 index 증가
    if [ "$RANK_MODE" = "staggered" ]; then
        ((index++))
    fi
done

TOTAL=${#SELECTED_VERSIONS[@]}

if [ "$TOTAL" -eq 0 ]; then
    echo -e "${RED}선택된 버전이 없습니다.${NC}"
    exit 1
fi

echo -e "\n${BLUE}Installing $TOTAL versions${NC}\n"

SUCCESS=0
FAILED=0
SKIPPED=0

# 메이저 버전 순서대로 설치
for major in $(echo "${!SELECTED_VERSIONS[@]}" | tr ' ' '\n' | sort -n); do
    entry="${SELECTED_VERSIONS[$major]}"
    version=$(echo "$entry" | cut -d'|' -f1)
    download_url=$(echo "$entry" | cut -d'|' -f2)

    # 버전 형식 변환: 점 → 하이픈
    version_hyphen=$(echo "$version" | tr '.' '-')
    install_path="$INSTALL_DIR/chrome-${version_hyphen}-testing"
    chrome_binary="$install_path/chrome-linux64/chrome"

    echo -e "${BLUE}[$((SUCCESS + FAILED + SKIPPED + 1))/$TOTAL]${NC} Chrome $major ($version) ${YELLOW}[testing]${NC}"

    # 이미 설치되어 있는지 확인
    if [ -f "$chrome_binary" ]; then
        echo -e "  ${YELLOW}Already installed, skipping${NC}"
        ((SKIPPED++))
        continue
    fi

    # 다운로드
    zip_path="$TEMP_DIR/chrome-$version.zip"

    echo "  Downloading..."
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

    # 압축 해제
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

    # 설치 확인
    if [ -f "$chrome_binary" ]; then
        installed_version=$("$chrome_binary" --version 2>/dev/null | awk '{print $NF}' || echo "$version")
        echo -e "  ${GREEN}✓ Installed: Chrome $installed_version [testing]${NC}"
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

if [ "$RANK_MODE" = "staggered" ]; then
    echo -e "\n${CYAN}Staggered build strategy:${NC}"
    echo -e "${CYAN}- Latest major version → newest build (rank 1)${NC}"
    echo -e "${CYAN}- Older major versions → progressively older builds${NC}"
    echo -e "${CYAN}This creates natural temporal diversity${NC}"
else
    echo -e "\n${CYAN}Fixed rank strategy:${NC}"
    echo -e "${CYAN}- All major versions → rank ${FIXED_RANK} build${NC}"
fi
