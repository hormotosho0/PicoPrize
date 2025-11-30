# How to Add Contracts Later

## ✅ Web App Successfully Committed!

Your web app has been committed (121 files). Now you need to push it to GitHub.

## 🚀 Push Web App Now

You have a few options to authenticate:

### Option 1: Use GitHub CLI (Recommended)
```bash
gh auth login
git push -u origin main
```

### Option 2: Use Personal Access Token
```bash
# Push with token (GitHub will prompt for password, use your token)
git push -u origin main
# When prompted:
# Username: adamstosho
# Password: [your personal access token]
```

### Option 3: Use SSH (if you have SSH keys set up)
```bash
git remote set-url origin git@github.com:adamstosho/PicoPrize.git
git push -u origin main
```

---

## 📦 Add Contracts Tomorrow

When you're ready to add contracts:

### Step 1: Remove the temporary exclusion
Edit `.gitignore` and remove or comment out this line:
```
# apps/contracts/
```

### Step 2: Add contracts
```bash
git add apps/contracts/
git commit -m "feat: add smart contracts

- Add PicoPrizePool contract
- Add PicoPrizeReputation contract  
- Add PicoPrizeCommitReveal contract
- Add deployment scripts and tests"
```

### Step 3: Push
```bash
git push origin main
```

---

## ✅ Current Status

- ✅ Web app committed (121 files)
- ✅ Contracts excluded (will add later)
- ⏳ Waiting for push to GitHub (needs authentication)

---

**Next Step**: Authenticate with GitHub and push!


