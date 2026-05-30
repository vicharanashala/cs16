# Login & Registration Failure - Troubleshooting Guide

## Root Cause

The primary reason for login/registration failures is **MongoDB connection issues**.

### Why MongoDB Connection Matters
```
User clicks "Login/Register"
    ↓
Client sends request to API
    ↓
Server receives request
    ↓
Server queries MongoDB for user
    ↓ ❌ FAILS if MongoDB not accessible
Server cannot authenticate user
    ↓
Login fails with error
```

---

## Prerequisites Check

### 1. Is MongoDB Running?

**Check if you can access MongoDB:**
```powershell
# Test MongoDB Atlas connection (if using cloud)
$env:MONGO_URI="mongodb+srv://..."
npm run seed

# Or test local MongoDB
mongod --version  # Check if installed
```

**Current Status:**
- ❌ MongoDB Atlas DNS issue detected
- ❌ Local MongoDB not running

**Solution:**
- Set up local MongoDB or
- Fix MongoDB Atlas connectivity

### 2. Is the Backend Server Running?

```powershell
# Kill old processes
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# Start backend
cd server
npm run dev

# Check if running on port 5000
netstat -ano | findstr :5000
```

### 3. Is the Frontend Connected?

```powershell
# Start frontend (in another terminal)
cd client
npm run dev

# It should open http://localhost:5173
```

---

## Step-by-Step Fix

### Step 1: Fix MongoDB Connection

Since MongoDB Atlas DNS isn't resolving, use **local MongoDB**:

#### Option A: Install Local MongoDB
```powershell
# Download from https://www.mongodb.com/try/download/community
# Install and start MongoDB service

# Or use MongoDB Compass GUI
# It provides a local instance option
```

#### Option B: Use MongoDB via Docker
```powershell
# Pull MongoDB image
docker pull mongo

# Run MongoDB container
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Update .env to use local MongoDB
# MONGO_URI=mongodb://localhost:27017/faqapp
```

#### Option C: Try MongoDB Atlas Again (Different Network)
```powershell
# If behind corporate firewall, try:
# 1. Use VPN
# 2. Use mobile hotspot
# 3. Use different ISP/network
```

### Step 2: Verify Backend Connection

Update `server/.env`:
```env
# Use local MongoDB (temporary fix)
MONGO_URI=mongodb://localhost:27017/faqapp

# Or keep Atlas URL if DNS is fixed
MONGO_URI=mongodb+srv://swarnabhabcivilug_db_user:fpWjV8oebXFyZrWm@cluster0.ea0jkd2.mongodb.net/faqapp?retryWrites=true&w=majority&appName=Cluster0
```

Test backend directly:
```powershell
cd server
npm run dev

# In another terminal, test login endpoint
curl -X POST http://localhost:5000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"admin@faqapp.com","password":"admin123"}'

# Expected response:
# {"message":"Login successful","token":"...","user":{...}}
# or
# {"error":"Invalid email or password"} (if DB empty, seed first)
```

### Step 3: Seed the Database

```powershell
# Make sure MongoDB is running first, then:
npm run seed

# Should output:
# Connected to MongoDB
# Created admin user: admin@faqapp.com / admin123
# Database seeded successfully
```

### Step 4: Fix Frontend API Configuration

The client API configuration has been fixed to:
```javascript
// Auto-detect: use /api (proxy) in dev, full URL in prod
const API_URL = import.meta.env.VITE_API_URL 
  ? import.meta.env.VITE_API_URL
  : (import.meta.env.MODE === 'development' ? '/api' : 'http://localhost:5000');
```

**No additional config needed** if running dev server with Vite proxy.

### Step 5: Fix AuthContext

The AuthContext has been updated to:
- ✅ Remove axios-style API calls
- ✅ Work with custom fetch API
- ✅ Automatically include token via getHeaders()
- ✅ Better error handling

### Step 6: Test Login Flow

```powershell
# 1. Start backend
cd server
npm run dev

# 2. In another terminal, start frontend
cd client
npm run dev

# 3. In browser at http://localhost:5173:
#    - Click "Try Demo Account" or
#    - Login with: admin@faqapp.com / admin123
#    - Or register a new account
```

---

## Common Issues & Solutions

### Issue 1: "Network Error" or Timeout

**Causes:**
- Backend not running
- MongoDB not accessible
- CORS issues

**Fix:**
```powershell
# 1. Check backend is running
netstat -ano | findstr :5000

# 2. Check MongoDB is running
mongod --version
# or
docker ps | grep mongodb

# 3. Check CORS in server/app.js
# Should have: app.use(cors());
```

### Issue 2: "Invalid email or password"

**Causes:**
- Admin user not created (seed not run)
- Using wrong credentials

**Fix:**
```powershell
# Run seed to create admin user
npm run seed

# Login with:
# Email: admin@faqapp.com
# Password: admin123
```

### Issue 3: "Login failed" (Generic error)

**Causes:**
- MongoDB connection error
- User not found
- Password hash comparison failed

**Debug:**
```powershell
# 1. Check server logs in terminal running backend
# Look for: "Login error: ..." 

# 2. Test endpoint directly
curl -X POST http://localhost:5000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"admin@faqapp.com","password":"admin123"}'

# 3. Check database connection
node -e "const m = require('mongoose'); m.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/faqapp').then(() => console.log('✅ Connected')).catch(e => console.log('❌ Error:', e.message));"
```

### Issue 4: CORS Error in Browser

**Symptom:**
```
Access to XMLHttpRequest at 'http://localhost:5000/api/auth/login'
from origin 'http://localhost:5173' has been blocked by CORS policy
```

**Fix:**
Verify server/app.js has:
```javascript
app.use(cors());  // This enables CORS
```

If missing, add it before routes.

---

## Verified Configuration

### ✅ Client (Fixed)
- API configuration works with proxy
- AuthContext handles errors properly
- Token storage and retrieval working

### ✅ Server (Configuration Ready)
- CORS enabled
- Auth routes configured
- Seed script creates admin user

### ❌ Missing: MongoDB Access
- Local MongoDB needed
- Or MongoDB Atlas connectivity fix needed

---

## Quick Diagnostic Script

Save this as `test-login.js` in root:

```javascript
const api = 'http://localhost:5000';

async function testLogin() {
  console.log('🔍 Testing login flow...\n');

  // Test 1: API connectivity
  console.log('1️⃣ Testing API connectivity...');
  try {
    const response = await fetch(`${api}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@faqapp.com',
        password: 'admin123'
      })
    });
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Login successful!');
      console.log('   Token:', data.token?.substring(0, 20) + '...');
      console.log('   User:', data.user.name);
    } else {
      console.log('❌ Login failed:', data.error);
    }
  } catch (error) {
    console.log('❌ Connection error:', error.message);
  }
}

testLogin();
```

Run with:
```powershell
node test-login.js
```

---

## Final Checklist

- [ ] MongoDB is running (local or Atlas)
- [ ] Backend server started (`npm run dev` in server/)
- [ ] Frontend server started (`npm run dev` in client/)
- [ ] Admin user exists (run `npm run seed`)
- [ ] Trying correct credentials (admin@faqapp.com / admin123)
- [ ] No CORS errors in browser console
- [ ] API endpoint responds (test with curl/Postman)

---

## Next Steps

1. **Set up MongoDB locally** (easiest solution)
   - Docker: `docker run -d -p 27017:27017 mongo:latest`
   - Or local installation

2. **Update .env** to use local MongoDB:
   ```env
   MONGO_URI=mongodb://localhost:27017/faqapp
   ```

3. **Restart servers:**
   ```powershell
   npm run seed        # Create admin
   npm run dev        # Start both servers
   ```

4. **Login in browser:**
   - Go to http://localhost:5173
   - Email: admin@faqapp.com
   - Password: admin123

---

## Support

**Check these in order:**
1. Is MongoDB accessible? (Critical)
2. Is backend running on port 5000?
3. Is frontend running on port 5173?
4. Check browser console for errors
5. Check terminal for server logs

**Error messages should now be clearer** - read them carefully as they indicate the exact issue!
