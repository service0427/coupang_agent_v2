/**
 * Ubuntu 환경 설정 및 종속성 확인 유틸리티
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class UbuntuSetup {
  /**
   * Ubuntu 환경에서 Chrome 실행에 필요한 종속성 확인
   */
  static async checkDependencies() {
    if (process.platform !== 'linux') {
      console.log('ℹ️ Ubuntu가 아닌 환경에서는 종속성 확인을 건너뜁니다.');
      return { success: true, message: 'Non-Ubuntu environment' };
    }

    console.log('🔍 Ubuntu Chrome 종속성 확인 중...');
    
    const requiredPackages = [
      'libnss3',
      'libgconf-2-4',
      'libxss1',
      'libasound2',
      'libxtst6',
      'libxrandr2',
      'libasound2',
      'libpangocairo-1.0-0',
      'libatk1.0-0',
      'libcairo-gobject2',
      'libgtk-3-0',
      'libgdk-pixbuf2.0-0'
    ];

    const missingPackages = [];
    
    try {
      // 각 패키지 설치 상태 확인
      for (const pkg of requiredPackages) {
        try {
          await execAsync(`dpkg -l ${pkg} 2>/dev/null | grep -q "^ii"`);
        } catch (error) {
          missingPackages.push(pkg);
        }
      }

      if (missingPackages.length === 0) {
        console.log('✅ 모든 Chrome 종속성이 설치되어 있습니다.');
        return { success: true, message: 'All dependencies satisfied' };
      } else {
        console.log('⚠️ 누락된 Chrome 종속성이 발견되었습니다:');
        missingPackages.forEach(pkg => console.log(`   - ${pkg}`));
        
        const installCommand = `sudo apt-get update && sudo apt-get install -y ${missingPackages.join(' ')}`;
        console.log('\\n📦 누락된 종속성 설치 명령어:');
        console.log(installCommand);
        
        return { 
          success: false, 
          message: 'Missing dependencies', 
          missingPackages,
          installCommand 
        };
      }
    } catch (error) {
      console.error('❌ 종속성 확인 중 오류:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Ubuntu 환경에서 Chrome 브라우저 설치 여부 확인
   */
  static async checkBrowserInstallation() {
    if (process.platform !== 'linux') {
      return { success: true, message: 'Non-Ubuntu environment' };
    }

    console.log('🔍 Chrome 브라우저 설치 상태 확인 중...');
    
    const browsers = [
      { name: 'Google Chrome', command: 'google-chrome --version' },
      { name: 'Chromium', command: 'chromium-browser --version' },
      { name: 'Chromium (snap)', command: 'chromium --version' }
    ];

    const installedBrowsers = [];
    
    for (const browser of browsers) {
      try {
        const { stdout } = await execAsync(browser.command + ' 2>/dev/null');
        if (stdout.trim()) {
          installedBrowsers.push({
            name: browser.name,
            version: stdout.trim()
          });
        }
      } catch (error) {
        // 브라우저가 설치되지 않음
      }
    }

    if (installedBrowsers.length > 0) {
      console.log('✅ 설치된 브라우저:');
      installedBrowsers.forEach(browser => {
        console.log(`   - ${browser.name}: ${browser.version}`);
      });
      return { success: true, browsers: installedBrowsers };
    } else {
      console.log('⚠️ Chrome 계열 브라우저가 설치되지 않았습니다.');
      console.log('\\n📦 Chrome 설치 명령어 (중 하나 선택):');
      console.log('# Google Chrome:');
      console.log('wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -');
      console.log('echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list');
      console.log('sudo apt-get update && sudo apt-get install -y google-chrome-stable');
      console.log('\\n# 또는 Chromium:');
      console.log('sudo apt-get install -y chromium-browser');
      
      return { success: false, message: 'No Chrome browser found' };
    }
  }

  /**
   * 시스템 메모리 및 /dev/shm 공간 확인
   */
  static async checkSystemResources() {
    if (process.platform !== 'linux') {
      return { success: true, message: 'Non-Ubuntu environment' };
    }

    console.log('🔍 시스템 자원 확인 중...');
    
    try {
      // 메모리 확인
      const { stdout: memInfo } = await execAsync('free -m');
      const memLines = memInfo.split('\\n');
      const memLine = memLines.find(line => line.startsWith('Mem:'));
      
      if (memLine) {
        const [, total, used, free] = memLine.split(/\\s+/).map(Number);
        console.log(`💾 시스템 메모리: ${total}MB (사용중: ${used}MB, 여유: ${free}MB)`);
        
        if (free < 512) {
          console.log('⚠️ 메모리 부족: 512MB 이상의 여유 메모리를 권장합니다.');
        }
      }

      // /dev/shm 공간 확인
      const { stdout: shmInfo } = await execAsync('df -h /dev/shm 2>/dev/null');
      const shmLines = shmInfo.split('\\n');
      const shmLine = shmLines.find(line => line.includes('/dev/shm'));
      
      if (shmLine) {
        const [, size, used, avail] = shmLine.split(/\\s+/);
        console.log(`📁 /dev/shm 공간: ${size} (사용중: ${used}, 여유: ${avail})`);
        
        // 여유 공간이 100MB 미만인 경우 경고
        const availMB = parseInt(avail.replace(/[^0-9]/g, ''));
        if (availMB < 100) {
          console.log('⚠️ /dev/shm 공간 부족: --disable-dev-shm-usage 인자가 자동 적용됩니다.');
        }
      }

      // DISPLAY 환경변수 확인
      const display = process.env.DISPLAY;
      if (!display) {
        console.log('🖥️ DISPLAY 환경변수 없음: headless 모드로 자동 실행됩니다.');
      } else {
        console.log(`🖥️ DISPLAY 환경변수: ${display}`);
      }

      return { success: true, message: 'System resources checked' };
      
    } catch (error) {
      console.error('❌ 시스템 자원 확인 중 오류:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * 완전한 Ubuntu 환경 설정 확인
   */
  static async checkAll() {
    console.log('🐧 Ubuntu Chrome 실행 환경 전체 점검 시작\\n');
    
    const results = {
      dependencies: await this.checkDependencies(),
      browser: await this.checkBrowserInstallation(),
      resources: await this.checkSystemResources()
    };
    
    const hasIssues = !results.dependencies.success || !results.browser.success || !results.resources.success;
    
    console.log('\\n' + '='.repeat(60));
    if (hasIssues) {
      console.log('⚠️ Ubuntu 환경 설정에 문제가 있습니다.');
      console.log('위의 설치 명령어들을 실행한 후 다시 시도해보세요.');
    } else {
      console.log('✅ Ubuntu Chrome 실행 환경이 올바르게 설정되었습니다.');
    }
    console.log('='.repeat(60));
    
    return results;
  }
}

module.exports = UbuntuSetup;