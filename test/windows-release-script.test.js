'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const scriptPath = path.join(__dirname, '..', 'scripts', 'build-win-release.ps1');
const launcherPath = path.join(__dirname, '..', 'scripts', 'build-win-release.cmd');
const hiddenLauncherPath = path.join(__dirname, '..', 'scripts', 'launcher-hidden.vbs');
const standardRelaunchPath = path.join(__dirname, '..', 'scripts', 'windows-relaunch-standard.ps1');
const scriptBytes = fs.readFileSync(scriptPath);
const source = scriptBytes.toString('utf8');
const launcher = fs.readFileSync(launcherPath, 'utf8');
const hiddenLauncherBytes = fs.readFileSync(hiddenLauncherPath);
const standardRelaunchBytes = fs.readFileSync(standardRelaunchPath);

test('Windows release script interactively builds both profiles for one version', () => {
  assert.deepEqual([...scriptBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'Windows PowerShell 5.1 needs a UTF-8 BOM for Chinese prompts');
  assert.match(source, /Read-Host\s+"[^"]*版本号/);
  assert.match(source, /\$Version -notmatch '\^\\d\+\\\.\\d\+\\\.\\d\+\$'/);
  assert.match(source, /foreach \(\$profile in @\('workbuddy-cn', 'workbuddy-ai'\)\)/);
  assert.match(source, /build-win-zip\.sh/);
  assert.match(source, /build-win-installer\.ps1/);
  assert.match(source, /-IsccPath \$Compiler \| Out-Host/);
  assert.match(source, /WORKDADDY_BUILD_PROFILE/);
  assert.match(source, /-Version \$ReleaseVersion/);
  assert.match(launcher, /build-win-release\.ps1/);
  assert.match(launcher, /ExecutionPolicy Bypass/);
});

test('Windows hidden launcher stays parseable under WSH code pages', () => {
  assert.equal(hiddenLauncherBytes.some((byte) => byte >= 0x80), false);
});

test('desktop shortcut invokes Node directly without a hidden cmd wrapper', () => {
  const hidden = hiddenLauncherBytes.toString('utf8');
  const commands = hidden.split(/\r?\n/).filter((line) => /^command\s*=/.test(line));
  assert.equal(commands.length, 1);
  assert.match(commands[0], /--experimental-sqlite/);
  assert.match(commands[0], /launcherJs/);
  assert.doesNotMatch(commands[0], /ComSpec|cmd\.exe|launcher\.cmd/i);
  assert.match(hidden, /runtime\\node\\node\.exe/);
  assert.match(hidden, /\.workbuddy\\binaries\\node\\versions/);
});

test('legacy desktop installer retains the auto-closing visible launcher fallback', () => {
  const silent = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'launcher-silent.cmd'), 'utf8');
  const installer = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'install-win.ps1'), 'utf8');
  assert.match(silent, /set WBSWITCH_NO_PAUSE=1/i);
  assert.match(silent, /call "%~dp0launcher\.cmd" %\*/i);
  assert.match(installer, /\$launcherSilent = Join-Path \$targetScripts 'launcher-silent\.cmd'/);
  assert.match(installer, /elseif \(Test-Path \$launcherSilent\) \{\s*\$sc\.TargetPath\s*= \$launcherSilent/);
});

test('Windows standard relaunch script is UTF-8 with BOM for Windows PowerShell 5.1', () => {
  assert.deepEqual([...standardRelaunchBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('Windows standard relaunch falls back to the Explorer Shell object by executable path', () => {
  const relaunch = standardRelaunchBytes.toString('utf8');
  assert.match(relaunch, /shellWindows\.Windows\(\)/);
  assert.match(relaunch, /GetFileName\(\[string\]\$_.FullName\).*explorer\.exe/);
  assert.doesNotMatch(relaunch, /Get-Process\s+-Name\s+explorer/);
});

test('Windows watchdog uses an OS-managed profile lock and keeps restart backoff', () => {
  const watchdog = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'watchdog.js'), 'utf8');
  assert.match(watchdog, /net\.createServer\(\)/);
  assert.match(watchdog, /const LOCK_PORT = PROFILE\.id === 'workbuddy-ai' \? 47933 : 47932/);
  assert.match(watchdog, /exclusive:\s*true/);
  assert.match(watchdog, /restartDelay = Math\.min\(restartDelay \* 2, 60000\)/);
  assert.doesNotMatch(watchdog, /pending\.json|updateProcessIsActive|powershell|Get-CimInstance|taskkill/i);
});

test('every Windows batch file under scripts/ keeps CRLF line endings', () => {
  // .gitattributes declares `*.cmd -text`, so git performs no line-ending
  // conversion: whatever the blob holds is what cmd.exe receives. An LF-only
  // batch file makes cmd.exe mis-parse parenthesised blocks, which is exactly
  // what the Windows release workflow fails closed on (the 校验 CRLF step).
  // Some upstream files mix endings but still carry CRLF, so the enforced rule
  // is "not LF-only" rather than "no bare LF anywhere".
  const scriptsDir = path.join(__dirname, '..', 'scripts');
  const skipDirs = new Set(['node_modules', 'runtime']);
  const batches = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(full);
      } else if (/\.cmd$/i.test(entry.name)) {
        batches.push(full);
      }
    }
  };
  walk(scriptsDir);
  assert.ok(batches.length > 0, 'expected at least one Windows batch file under scripts/');
  for (const file of batches) {
    const rel = path.relative(path.join(__dirname, '..'), file);
    const text = fs.readFileSync(file).toString('latin1');
    const bare = text.replace(/\r\n/g, '').split('\n').length - 1;
    assert.ok(text.includes('\r\n'), `${rel} is LF-only (${bare} bare LF); cmd.exe needs CRLF`);
  }
});

test('Windows CRLF gate inspects raw bytes instead of text-mode grep', () => {
  // GNU grep on MS-Windows strips CR from files it decides are text before
  // matching, so `grep -q $'\r'` never matches on the windows-latest runner:
  // the gate then fails on the first .cmd in glob order whatever the file
  // holds (it reported Install-WorkDaddy.cmd even though that blob carries 47
  // CRLF pairs). Keep the byte-level check.
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'build-win.yml'), 'utf8');
  assert.doesNotMatch(workflow, /grep -q \$'\\r'/);
  assert.match(workflow, /od -An -tx1/);
});

test('Windows installer excludes the repair prompt from all release stages', () => {
  const zipBuild = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build-win-zip.sh'), 'utf8');
  const installerBuild = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build-win-installer.ps1'), 'utf8');
  const iss = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'win', 'workdaddy.iss'), 'utf8');
  assert.doesNotMatch(zipBuild, /cp\s+.*安装失败自主解决提示词/);
  assert.doesNotMatch(installerBuild, /Test-Path[\s\S]{0,160}安装失败自主解决提示词/);
  assert.doesNotMatch(iss, /Source:.*安装失败自主解决提示词/);
});
