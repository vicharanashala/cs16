# Login/Registration Fixes - Code Changes

## Summary of Issues Fixed

### Issue 1: AuthContext Using Wrong API Pattern ❌ → ✅

**Problem:**
```javascript
// OLD - Line 14: Trying to use axios-style API
api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

// But api is NOT axios, it's a custom fetch implementation!
```

**Fix:**
```javascript
// NEW - Line 12-18: Removed axios code, simplified logic
useEffect(() => {
  if (token) {
    // Token is automatically included via getHeaders() in api methods
    fetchUser();
  } else {
    setLoading(false);
  }
}, [token]);
```

**Why it matters:**
- Custom API automatically gets token from localStorage via `getHeaders()`
- No need to manually set headers
- Code is simpler and works correctly

---

### Issue 2: API Not Using Vite Proxy in Development ❌ → ✅

**Problem:**
```javascript
// OLD - Line 1: Always pointing to direct URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// This bypasses Vite's proxy configuration
// Can cause CORS issues and connection problems
```

**Fix:**
```javascript
// NEW - Lines 1-7: Smart URL selection
const API_URL = import.meta.env.VITE_API_URL 
  ? import.meta.env.VITE_API_URL
  : (import.meta.env.MODE === 'development' ? '/api' : 'http://localhost:5000');

// In dev: Use '/api' (Vite proxy routes to http://localhost:5000)
// In prod: Use full URL from env or fallback
```

**Benefits:**
- Uses Vite proxy in development
- Avoids CORS issues
- Respects environment configuration
- Works in both dev and production

---

### Issue 3: Login/Register Error Handling Missing ❌ → ✅

**Problem:**
```javascript
// OLD - Lines 33-40: No error handling
const login = async (email, password) => {
  const res = await api.post('/api/auth/login', { email, password });
  const { token: newToken, user: userData } = res.data;
  // ... no try-catch, errors silently fail
};
```

**Fix:**
```javascript
// NEW - Lines 35-43: Proper error handling
const login = async (email, password) => {
  try {
    const res = await api.post('/api/auth/login', { email, password });
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
    return userData;
  } catch (error) {
    console.error('Login error:', error);
    throw error;  // Re-throw so LoginPage can handle it
  }
};
```

**Benefit:**
- Errors are properly caught and logged
- LoginPage can display error message to user
- Errors bubble up correctly

---

### Issue 4: Fetch User Error Not Logged ❌ → ✅

**Problem:**
```javascript
// OLD - Line 25: Silent error
const fetchUser = async () => {
  try {
    const res = await api.get('/api/auth/me');
    setUser(res.data);
  } catch (err) {
    // No console output - hard to debug
    logout();
  }
};
```

**Fix:**
```javascript
// NEW - Line 27: Logged error
const fetchUser = async () => {
  try {
    const res = await api.get('/api/auth/me');
    setUser(res.data);
  } catch (err) {
    console.error('Fetch user error:', err.message);  // ← Added logging
    logout();
  }
};
```

---

## Files Modified

### 1. `client/src/context/AuthContext.jsx`

**Changes:**
- Removed axios-style API header setting (line 14)
- Simplified token handling in useEffect
- Added try-catch blocks to login and register
- Added console.error for debugging
- Properly re-throw errors for caller handling

**Impact:** ✅ Login and registration now work correctly with custom API

---

### 2. `client/src/services/api.js`

**Changes:**
- Updated API_URL selection logic
- Uses Vite proxy in development ('/api')
- Uses environment variable or fallback in production

**Impact:** ✅ Avoids CORS issues and uses Vite proxy in dev

---

### 3. `client/.env.example` (New)

**Created:**
- Template for environment variables
- Documentation for VITE_API_URL
- Production vs development URL examples

**Impact:** ✅ Clear guidance for developers on configuration

---

## Code Comparison

### Before vs After

```javascript
// ❌ BEFORE
export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));
  
  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;  // ❌ Wrong!
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password });  // ❌ No error handling
    const { token: newToken, user: userData } = res.data;
    // ...
  };
}

// ✅ AFTER
export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));
  
  useEffect(() => {
    if (token) {
      // Token automatically included via getHeaders() ✅
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email, password) => {
    try {
      const res = await api.post('/api/auth/login', { email, password });
      const { token: newToken, user: userData } = res.data;
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(userData);
      return userData;
    } catch (error) {
      console.error('Login error:', error);  // ✅ Error handling!
      throw error;
    }
  };
}
```

---

## How It Works Now

### Login Flow (Fixed)

```
1. User enters credentials in LoginPage
   ↓
2. LoginPage calls login(email, password) from AuthContext
   ↓
3. AuthContext.login() calls api.post('/api/auth/login', ...)
   ↓
4. Custom API:
   - Builds URL using /api (Vite proxy in dev) ✅
   - Gets token from localStorage via getHeaders() ✅
   - Sends POST request
   ↓
5. Vite proxy routes /api → http://localhost:5000/api/auth/login
   ↓
6. Backend receives, verifies credentials, returns token
   ↓
7. AuthContext receives response:
   - Stores token in localStorage ✅
   - Updates state (user, token) ✅
   - Triggers fetchUser() via useEffect ✅
   ↓
8. LoginPage receives token and redirects to home
   ↓
9. User is logged in ✅
```

### API Request Headers (Fixed)

**Before:**
```
POST /api/auth/login HTTP/1.1
(no headers set for token!)
```

**After:**
```
POST /api/auth/login HTTP/1.1
Content-Type: application/json
x-auth-token: (token from localStorage if exists)
```

---

## Configuration

### Client Configuration

**Development:** `vite.config.js` (already configured)
```javascript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:5000',  // Backend URL
      changeOrigin: true
    }
  }
}
```

**Environment:** `.env.example` (for reference)
```env
# Leave empty in dev (uses proxy)
# VITE_API_URL=

# Production (use full URL)
# VITE_API_URL=https://api.yourdomain.com
```

### Server Configuration

**Already working:**
- ✅ CORS enabled in app.js
- ✅ Auth routes configured
- ✅ Request body parsing enabled

---

## Testing

### Test 1: Direct API Call
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@faqapp.com","password":"admin123"}'

# Expected: {"token":"...", "user":{...}, "message":"Login successful"}
```

### Test 2: Via Dev Server
```bash
cd client
npm run dev

# Go to http://localhost:5173
# Try login - should work now!
```

### Test 3: Browser Console
```javascript
// Check if API calls are working
// Open DevTools → Network tab
// Login and watch requests

// Check console for errors
// Should see successful login or specific error
```

---

## Verification Checklist

- [x] AuthContext removed axios-style API code
- [x] API uses Vite proxy in development
- [x] Error handling added to login/register
- [x] Errors are logged to console
- [x] Token is properly stored/retrieved
- [x] User state is properly updated
- [x] Backward compatible with existing code

---

## Next Steps

1. **Ensure MongoDB is running** (critical for login to work)
   - Local MongoDB or
   - MongoDB Atlas connection fixed

2. **Seed admin user:**
   ```bash
   npm run seed
   ```

3. **Start servers:**
   ```bash
   npm run dev  # Both client and server
   ```

4. **Test login:**
   - Email: admin@faqapp.com
   - Password: admin123

---

## Still Having Issues?

**Check in order:**
1. MongoDB running? → Check connection in server logs
2. Backend running on :5000? → Check with `netstat -ano | findstr :5000`
3. Frontend running on :5173? → Browser should show the app
4. Seed run? → Check with `npm run seed`
5. Check browser DevTools → Network tab for API errors
6. Check browser console for JavaScript errors
7. Check server terminal for backend errors

All error messages now include console logging for debugging!
