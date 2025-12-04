# 쿠팡 에이전트 V2 설치 가이드

## 시스템 요구사항

- **운영체제**: Ubuntu 20.04+ (Linux 권장, GUI 모드 필수)
- **Node.js**: v18.0.0 이상
- **메모리**: 최소 4GB RAM (멀티쓰레드 사용 시 8GB 권장)
- **디스크**: 최소 10GB 여유 공간 (Chrome 버전별 설치 시 추가 필요)
- **네트워크**: 안정적인 인터넷 연결
- **디스플레이**: X11 환경 필수 (headless 모드 사용 불가)

## 1. Node.js 설치

```bash
# NodeSource 리포지토리 추가
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Node.js 설치
sudo apt-get install -y nodejs

# 버전 확인
node --version
npm --version
```

## 2. 시스템 의존성 설치

### Ubuntu/Debian
```bash
# 시스템 업데이트
sudo apt update

# Chrome 및 Playwright 의존성
sudo apt install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils

# Git 설치 (프로젝트 클론용)
sudo apt install -y git
```

## 3. 프로젝트 설치

```bash
# 프로젝트 클론
git clone <repository-url> coupang_agent_v2
cd coupang_agent_v2

# Node.js 의존성 설치 (Patchright Chromium 자동 설치 포함)
npm install

# 브라우저 의존성 재확인 (필요시)
npx patchright install-deps chromium
```

## 4. 설정 파일 확인

`environment.js` 파일에서 다음 설정을 확인하세요:
- 기본 화면 해상도 (1200x800)
- 타임아웃 설정 (기본 30초)

## 5. 기본 실행 테스트

```bash
# 단일 실행 테스트
node index.js --threads 1 --once

# 4쓰레드 연속 실행
node index.js --threads 4
```

## 6. 서비스 모드 설정 (선택사항)

### systemd 서비스 생성
```bash
# 서비스 파일 생성
sudo nano /etc/systemd/system/coupang-agent.service
```

서비스 파일 내용:
```ini
[Unit]
Description=Coupang Agent Service
After=network.target

[Service]
Type=simple
User=tech
WorkingDirectory=/home/tech/coupang_agent_v2
ExecStart=/usr/bin/node index.js --threads 4
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

서비스 활성화:
```bash
# 서비스 리로드
sudo systemctl daemon-reload

# 서비스 활성화
sudo systemctl enable coupang-agent

# 서비스 시작
sudo systemctl start coupang-agent

# 상태 확인
sudo systemctl status coupang-agent

# 로그 확인
sudo journalctl -u coupang-agent -f
```

## 7. 문제 해결

### GUI 모드에서 브라우저가 안 뜨는 경우
```bash
# X11 forwarding 확인 (SSH 연결시)
echo $DISPLAY

# X11 권한 설정
xhost +local:

# Virtual display 사용 (필요한 경우)
sudo apt install -y xvfb
export DISPLAY=:99
Xvfb :99 -screen 0 1200x800x24 &
```

### 메모리 부족 문제
```bash
# 스왑 파일 생성 (4GB)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 스왑 영구 설정
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 권한 문제
```bash
# 사용자를 필요한 그룹에 추가
sudo usermod -a -G video $USER
sudo usermod -a -G audio $USER

# 로그아웃 후 재로그인 필요
```

### 네트워크 문제
```bash
# DNS 설정 확인
cat /etc/resolv.conf

# 외부 연결 테스트
ping google.com
curl -I https://www.coupang.com
```

## 8. 유지보수

### 브라우저 데이터 정리 (주기적)
```bash
# 캐시 정리 (공유 캐시는 유지)
rm -rf browser-data/instance*/Default/Cookies*
rm -rf browser-data/instance*/Default/Session*
rm -rf browser-data/instance*/Default/Local\ Storage
```

### 업데이트
```bash
# 프로젝트 업데이트
git pull origin main

# 의존성 업데이트
npm install

# Patchright 업데이트
npx patchright install chromium
```

## 9. 허브 서버 정보

- **URL**: http://61.84.75.37:3302
- **작업 할당**: 자동
- **프록시 관리**: 자동
- **결과 제출**: 자동

허브 서버가 모든 작업 관리를 담당하므로 별도의 데이터베이스 설정은 필요하지 않습니다.