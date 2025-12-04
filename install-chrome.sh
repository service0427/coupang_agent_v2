#!/bin/bash
#
# Chrome for Testing - 다중 버전 다운로드 스크립트
# 121 ~ 최신 버전까지 각 메이저 버전의 최신 빌드를 다운로드
#

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 설정
CHROME_API="https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json"
INSTALL_DIR="$HOME/chrome-versions"
TEMP_DIR="/tmp/chrome-downloads"
MIN_VERSION=121

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Chrome for Testing - Multi Version Installer${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 사용법
show_usage() {
    echo -e "${GREEN}Chrome 설치 스크립트${NC}"
    echo
    echo "사용법:"
    echo "  $0           # 모든 버전 설치 (121~최신)"
    echo "  $0 list      # 설치 현황 확인"
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
            # 새 구조 (chrome-linux64/chrome) 또는 기존 구조 (opt/google/chrome/chrome)
            if [ -f "$dir/chrome-linux64/chrome" ] || [ -f "$dir/opt/google/chrome/chrome" ]; then
                dirname=$(basename "$dir")
                version=${dirname#chrome-}
                echo -e "  ${GREEN}✓${NC} Chrome $version"
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

# help 명령 처리
if [ "$1" = "help" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_usage
fi

# 디렉토리 생성
mkdir -p "$INSTALL_DIR"
mkdir -p "$TEMP_DIR"

# 환경 변수 전달
export INSTALL_DIR
export TEMP_DIR
export MIN_VERSION

# 특정 버전 지정 시
if [ -n "$1" ] && [ "$1" != "latest" ]; then
    export TARGET_VERSION="$1"
fi

if [ "$1" = "latest" ]; then
    export LATEST_ONLY="1"
fi

# Python으로 처리
python3 << 'PYTHON_SCRIPT'
import json
import urllib.request
import os
import zipfile
import shutil
from collections import defaultdict

# 설정
CHROME_API = "https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json"
INSTALL_DIR = os.environ.get('INSTALL_DIR', os.path.expanduser('~/chrome-versions'))
TEMP_DIR = os.environ.get('TEMP_DIR', '/tmp/chrome-downloads')
MIN_VERSION = int(os.environ.get('MIN_VERSION', '121'))
TARGET_VERSION = os.environ.get('TARGET_VERSION', None)
LATEST_ONLY = os.environ.get('LATEST_ONLY', None)

# 색상
RED = '\033[0;31m'
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
BLUE = '\033[0;34m'
NC = '\033[0m'

def main():
    # API에서 데이터 가져오기
    print(f"{YELLOW}Fetching Chrome versions from API...{NC}")
    with urllib.request.urlopen(CHROME_API) as response:
        data = json.loads(response.read().decode())

    versions = data.get('versions', [])

    # 메이저 버전별 최신 빌드 수집
    major_builds = defaultdict(lambda: {'version': '', 'revision': 0, 'url': ''})

    for v in versions:
        version = v.get('version', '')
        downloads = v.get('downloads', {})

        if 'chrome' not in downloads:
            continue

        # linux64 URL 찾기
        linux_url = None
        for d in downloads.get('chrome', []):
            if d.get('platform') == 'linux64':
                linux_url = d.get('url')
                break

        if not linux_url:
            continue

        parts = version.split('.')
        if len(parts) >= 4:
            major = int(parts[0])
            revision = int(parts[3])

            if major >= MIN_VERSION:
                if revision > major_builds[major]['revision']:
                    major_builds[major] = {
                        'version': version,
                        'revision': revision,
                        'url': linux_url
                    }

    # 설치할 버전 결정
    if TARGET_VERSION:
        target = int(TARGET_VERSION)
        if target in major_builds:
            versions_to_install = [target]
        else:
            print(f"{RED}Chrome {target} 버전을 찾을 수 없습니다{NC}")
            return
    elif LATEST_ONLY:
        versions_to_install = [max(major_builds.keys())]
    else:
        versions_to_install = sorted(major_builds.keys())

    total = len(versions_to_install)

    if total == 0:
        print(f"{RED}설치할 버전이 없습니다{NC}")
        return

    print(f"\n{BLUE}Installing {total} version(s): Chrome {min(versions_to_install)}-{max(versions_to_install)}{NC}\n")

    success = 0
    failed = 0
    skipped = 0
    updated = 0

    for i, major in enumerate(versions_to_install, 1):
        info = major_builds[major]
        version = info['version']
        url = info['url']

        # 폴더명: 점(.) → 하이픈(-)으로 변환 (기존 형식 유지)
        version_hyphen = version.replace('.', '-')
        install_path = os.path.join(INSTALL_DIR, f'chrome-{version_hyphen}')
        chrome_binary = os.path.join(install_path, 'chrome-linux64', 'chrome')

        print(f"{BLUE}[{i}/{total}] Chrome {major} ({version}){NC}")

        # 이미 설치되어 있는지 확인 (메이저 버전 기준)
        existing = None
        existing_revision = 0
        for d in os.listdir(INSTALL_DIR) if os.path.exists(INSTALL_DIR) else []:
            if d.startswith(f'chrome-{major}-') or d.startswith(f'chrome-{major}.'):
                check_path = os.path.join(INSTALL_DIR, d, 'chrome-linux64', 'chrome')
                check_path_old = os.path.join(INSTALL_DIR, d, 'opt', 'google', 'chrome', 'chrome')
                if os.path.exists(check_path) or os.path.exists(check_path_old):
                    existing = d
                    # 기존 버전의 revision 추출 (마지막 숫자)
                    try:
                        parts = d.replace('chrome-', '').replace('-', '.').split('.')
                        if len(parts) >= 4:
                            existing_revision = int(parts[3])
                    except:
                        pass
                    break

        # 새 빌드가 더 높으면 기존 삭제 후 설치, 같거나 낮으면 스킵
        new_revision = info['revision']
        if existing:
            if new_revision <= existing_revision:
                print(f"  {YELLOW}Already up-to-date ({existing}), skipping{NC}")
                skipped += 1
                continue
            else:
                print(f"  {BLUE}Updating: {existing_revision} → {new_revision}{NC}")
                import shutil as sh
                sh.rmtree(os.path.join(INSTALL_DIR, existing))
                updated += 1

        try:
            # 다운로드
            zip_path = os.path.join(TEMP_DIR, f'chrome-{version}.zip')
            print(f"  Downloading...")
            urllib.request.urlretrieve(url, zip_path)

            # 압축 해제
            print(f"  Extracting...")
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(TEMP_DIR)

            # 설치
            os.makedirs(install_path, exist_ok=True)
            extracted_dir = os.path.join(TEMP_DIR, 'chrome-linux64')
            target_dir = os.path.join(install_path, 'chrome-linux64')

            if os.path.exists(target_dir):
                shutil.rmtree(target_dir)
            shutil.move(extracted_dir, target_dir)

            # 실행 권한
            for binary in ['chrome', 'chrome_crashpad_handler', 'chrome_sandbox', 'chrome-wrapper']:
                binary_path = os.path.join(target_dir, binary)
                if os.path.exists(binary_path):
                    os.chmod(binary_path, 0o755)

            # 정리
            os.remove(zip_path)

            # 확인
            import subprocess
            result = subprocess.run([os.path.join(target_dir, 'chrome'), '--version'],
                                    capture_output=True, text=True)
            installed_version = result.stdout.strip().split()[-1] if result.returncode == 0 else version

            print(f"  {GREEN}✓ Installed: Chrome {installed_version}{NC}")
            success += 1

        except Exception as e:
            print(f"  {RED}✗ Failed: {e}{NC}")
            failed += 1

    # 결과 요약
    print(f"\n{GREEN}========================================{NC}")
    print(f"{GREEN}Installation Complete{NC}")
    print(f"{GREEN}Success: {success}, Updated: {updated}, Skipped: {skipped}, Failed: {failed}{NC}")
    print(f"{GREEN}========================================{NC}")
    print(f"\n{BLUE}Chrome installations: {INSTALL_DIR}{NC}")
    print(f"{BLUE}설치 확인: ./install-chrome.sh list{NC}")

if __name__ == '__main__':
    main()
PYTHON_SCRIPT
