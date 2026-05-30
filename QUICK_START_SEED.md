# Quick Start: Seeding Your Database

## ⚡ TL;DR

```bash
# 1. Ensure FAQ.txt is in project root
ls cs16/FAQ.txt

# 2. Run seed
npm run seed

# 3. Login with
# Email: admin@faqapp.com
# Password: admin123
```

## 📋 Setup Steps

### Step 1: Prepare FAQ.txt

The file should be at: `cs16/FAQ.txt`

**Format:**
```
TABLE OF CONTENTS

1. Section Title
1.1 Question One
1.2 Question Two

===== QA SECTION =====

1.1 Question One
§ Answer to question one

1.2 Question Two
§ Answer to question two
```

You can:
- ✅ Use the sample FAQ.txt provided in cs16/
- ✅ Copy your existing FAQ.txt to cs16/FAQ.txt
- ✅ Specify custom path via `FAQ_TXT_PATH` environment variable

### Step 2: Run Seed Script

**Option A: Safe Seed (Recommended)**
```bash
npm run seed
```
This creates/ensures admin account exists. Safe to run multiple times.

**Option B: Full Reset**
```bash
RESET_DB=true npm run seed
```
This clears all data and reseeds. Use carefully in development only.

**Option C: With Custom FAQ Path**
```bash
export FAQ_TXT_PATH=/path/to/your/FAQ.txt
npm run seed
```

### Step 3: Verify It Worked

**Expected output:**
```
Connected to MongoDB
✅ Created admin user: admin@faqapp.com / admin123
✅ Parsed 9 FAQs from FAQ.txt across 3 sections
✅ Inserted 9 FAQs into database
✅ Created default community board pins

=== FAQ Count by Section ===
  1. Getting Started: 3 FAQs
  2. Asking Questions: 3 FAQs
  3. Answering Questions: 3 FAQs

✅ Seed completed successfully! Total: 9 FAQs
```

## 🛠️ Configuration

### In .env file

```env
# MongoDB connection (required)
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/faqapp

# FAQ file path (optional)
# Leave empty to use cs16/FAQ.txt
FAQ_TXT_PATH=

# Other settings...
PORT=5000
JWT_SECRET=your-secret-key
```

### Via Environment Variable

```bash
export FAQ_TXT_PATH=/absolute/path/to/FAQ.txt
npm run seed
```

Or on Windows:
```powershell
$env:FAQ_TXT_PATH="C:\path\to\FAQ.txt"
npm run seed
```

## ❓ Troubleshooting

### Problem: "FAQ.txt not found"

**Solution:**
1. Check file exists: `ls cs16/FAQ.txt`
2. If missing, create from sample or copy existing FAQ.txt
3. Verify path in error message is correct
4. Run seed again

### Problem: "Cannot connect to MongoDB"

**Solution:**
1. Verify MongoDB is running/accessible
2. Check MONGO_URI in .env
3. If using MongoDB Atlas, ensure:
   - IP is whitelisted in Network Access
   - Cluster is in "Ready" state (not provisioning)
   - Connection string is correct

### Problem: Seed runs but no FAQs

This is OK! The seed:
1. Creates admin account ✅
2. Tries to parse FAQ.txt
3. If FAQ.txt missing, continues anyway
4. You can still login and manually add FAQs

**To add FAQs:**
- Place FAQ.txt in cs16/
- Run: `RESET_DB=true npm run seed`

### Problem: "RESET_DB=true not set" message

This is expected behavior when running `npm run seed` without FAQ changes.
- Safe to run multiple times (idempotent)
- Won't delete existing data
- To force reset: `RESET_DB=true npm run seed`

## 📝 FAQ.txt Format Rules

### Structure
```
TABLE OF CONTENTS          ← Header
[sections with questions]  ← TOC

===== QA SECTION =====    ← Separator (long line of =)
[questions with answers]  ← QA pairs
```

### Section Format
```
N. Section Title
N.M Question text
```

### Answer Format
```
N.M Question text
§ Answer text here...
```

### Example
```
1. Getting Started
1.1 What is this?

===== QA SECTION =====

1.1 What is this?
§ This is an example. It shows how to structure your FAQ file.
```

## ✅ Checklist

- [ ] FAQ.txt exists in cs16/ or FAQ_TXT_PATH is set
- [ ] MongoDB is running and accessible
- [ ] .env has valid MONGO_URI
- [ ] Run `npm run seed`
- [ ] Verify output shows success
- [ ] Login with admin@faqapp.com / admin123

## 🚀 Next Steps

After successful seed:

1. **Start Development Server**
   ```bash
   npm run dev
   ```

2. **Access Application**
   - Open: http://localhost:5173
   - Login with admin credentials

3. **Upload or Add FAQs**
   - Use admin dashboard
   - Add more FAQs manually
   - Or modify FAQ.txt and reseed

## 📚 Documentation

- Full fix details: `FAQ_TXT_FIX_SUMMARY.md`
- Before/After comparison: `BEFORE_AFTER_COMPARISON.md`
- Server README: `server/README.md`

## 💡 Tips

- Seed is safe to run multiple times (without RESET_DB=true)
- FAQ.txt format should strictly follow the pattern
- Empty answers are skipped during parsing
- Use `§` character to mark where answer begins
- Section numbers must be sequential (1, 2, 3...)
- Question IDs follow format N.M (e.g., 1.1, 2.3)

Need help? Check the documentation files or error messages - they now provide clear guidance!
