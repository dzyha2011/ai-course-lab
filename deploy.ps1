# GitHub Pages 部署脚本 — 在 PowerShell 中运行
# 前置条件: gh auth login 已完成

$ErrorActionPreference = "Stop"
Set-Location "J:\讲义（完成）_deploy"

# 获取 GitHub 用户名
Write-Host "=== 获取 GitHub 用户信息 ===" -ForegroundColor Green
$user = (gh api user --jq .login) -replace '\s',''
if (-not $user) {
    Write-Host "无法获取 GitHub 用户名，请确认 gh auth login 已完成" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "GitHub 用户: $user"

$repo = "ai-course-lab"
$repoUrl = "https://github.com/$user/$repo"
$pagesUrl = "https://${user}.github.io/$repo/"

# 创建仓库并推送
Write-Host "`n=== 创建 GitHub 仓库 ===" -ForegroundColor Green
$repoExists = $false
gh repo view "$user/$repo" 2>$null
if ($LASTEXITCODE -eq 0) {
    $repoExists = $true
    Write-Host "仓库已存在: $repoUrl" -ForegroundColor Yellow
}

if (-not $repoExists) {
    gh repo create $repo --public --source=. --remote=origin --push
    if ($LASTEXITCODE -ne 0) {
        Write-Host "创建失败，尝试设置 remote 并直接推送..." -ForegroundColor Yellow
        git remote add origin "https://github.com/$user/$repo.git" 2>$null
        git push -u origin master
    }
} else {
    git remote add origin "https://github.com/$user/$repo.git" 2>$null
    git push -u origin master
}

# 启用 GitHub Pages
Write-Host "`n=== 启用 GitHub Pages ===" -ForegroundColor Green
gh api "/repos/$user/$repo/pages" -X POST -f "source[branch]=master" -f "source[path]=/" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Pages 可能已启用，或需手动开启:" -ForegroundColor Yellow
    Write-Host "  访问: $repoUrl/settings/pages" -ForegroundColor Cyan
    Write-Host "  选择 Source: Deploy from a branch, Branch: master / (root)" -ForegroundColor Cyan
}

Write-Host "`n=== 完成 ===" -ForegroundColor Green
Write-Host "网站地址 (等待1-2分钟部署): $pagesUrl"
pause
