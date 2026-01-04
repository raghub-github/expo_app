# Database Connection Strings - Complete Guide

## 🎯 **QUICK ANSWER**

### **Backend (.env file):**
✅ **Use Pooler Connection** (port 6543) - For application runtime
```env
DATABASE_URL="postgresql://postgres.mjfnzmepmeqemcoakjkw:[YOUR-PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
```

### **Rider App (.env file):**
❌ **DOES NOT NEED DATABASE CONNECTION**
✅ **Only needs Backend API URL:**
```env
EXPO_PUBLIC_API_BASE_URL=https://your-backend-api.com
```

---

## 📊 **DETAILED EXPLANATION**

### **Two Types of Connection Strings:**

#### **1. Direct Connection (Port 5432)**
```
postgresql://postgres:[YOUR-PASSWORD]@db.mjfnzmepmeqemcoakjkw.supabase.co:5432/postgres
```

**When to use:**
- ✅ Running SQL migrations in Supabase SQL Editor
- ✅ Admin tasks, one-off queries
- ✅ Database management tools (pgAdmin, DBeaver)
- ✅ Direct database access

**Characteristics:**
- Direct connection (no pooling)
- Limited concurrent connections (~100)
- Faster for single operations
- Not recommended for production apps

---

#### **2. Pooler Connection (Port 6543)**
```
postgresql://postgres.mjfnzmepmeqemcoakjkw:[YOUR-PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
```

**When to use:**
- ✅ **Backend application runtime** (NestJS/Node.js)
- ✅ Production applications
- ✅ Serverless functions
- ✅ Applications with many concurrent connections

**Characteristics:**
- Connection pooling enabled
- Handles connection management automatically
- Better for high-traffic applications
- Recommended for production

---

## 🔧 **SETUP INSTRUCTIONS**

### **Step 1: Backend Environment File**

**File:** `backend/.env` or `backend/.env.local`

```env
# Database Connection (USE POOLER - Port 6543)
DATABASE_URL="postgresql://postgres.mjfnzmepmeqemcoakjkw:[YOUR-PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

# Replace [YOUR-PASSWORD] with your actual Supabase database password
```

**Why Pooler?**
- Your backend handles multiple API requests simultaneously
- Each request might need a database connection
- Pooler manages connections efficiently
- Prevents "too many connections" errors

---

### **Step 2: Rider App Environment File**

**File:** `apps/gatimitra-riderApp/.env`

```env
# Backend API URL (NOT database connection!)
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000

# For production, use your deployed backend URL:
# EXPO_PUBLIC_API_BASE_URL=https://api.gatimitra.com

# Mapbox Token (for maps)
EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN=pk.eyJ1Ijo...

# Mapbox Download Token (for EAS builds)
RNMAPBOX__MAPS_DOWNLOAD_TOKEN=pk.eyJ1Ijo...
```

**Why NO Database Connection?**
- Rider app is a mobile app (React Native/Expo)
- Mobile apps should NEVER connect directly to database
- Security risk (exposes database credentials)
- Mobile apps connect to backend API via HTTP/HTTPS
- Backend API handles all database operations

---

## 🏗️ **ARCHITECTURE FLOW**

```
┌─────────────────┐
│   Rider App     │  (Mobile App - React Native)
│  (Expo/RN)      │
└────────┬────────┘
         │
         │ HTTP/HTTPS API Calls
         │ (REST endpoints)
         │
         ▼
┌─────────────────┐
│  Backend API    │  (NestJS/Node.js)
│  (Port 3000)    │
└────────┬────────┘
         │
         │ Database Connection
         │ (Pooler - Port 6543)
         │
         ▼
┌─────────────────┐
│   Supabase      │  (PostgreSQL Database)
│   Database      │
└─────────────────┘
```

**Key Points:**
1. Rider App → Backend API (HTTP)
2. Backend API → Database (PostgreSQL)
3. Rider App → Database ❌ (NEVER!)

---

## 📝 **COMPLETE ENV FILES**

### **Backend `.env` File:**

```env
# ============================================
# DATABASE CONNECTION (USE POOLER)
# ============================================
DATABASE_URL="postgresql://postgres.mjfnzmepmeqemcoakjkw:[YOUR-PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

# ============================================
# SUPABASE CONFIG
# ============================================
SUPABASE_URL=https://mjfnzmepmeqemcoakjkw.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# ============================================
# APPLICATION CONFIG
# ============================================
NODE_ENV=development
PORT=3000
API_BASE_URL=http://localhost:3000

# ============================================
# OTHER SERVICES
# ============================================
MSG91_AUTH_KEY=your_msg91_key
FIREBASE_PROJECT_ID=your_firebase_project_id
```

---

### **Rider App `.env` File:**

```env
# ============================================
# BACKEND API URL (NOT DATABASE!)
# ============================================
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
# For production: https://api.gatimitra.com

# ============================================
# MAPBOX TOKENS
# ============================================
EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN=pk.eyJ1Ijo...
RNMAPBOX__MAPS_DOWNLOAD_TOKEN=pk.eyJ1Ijo...

# ============================================
# OTP PROVIDER (Backend-driven)
# ============================================
EXPO_PUBLIC_OTP_PROVIDER=msg91
```

---

## ⚠️ **IMPORTANT NOTES**

### **1. Never Put Database Connection in Rider App:**
```env
# ❌ WRONG - Never do this in rider app!
DATABASE_URL="postgresql://..."
```

**Why?**
- Security risk (exposes database credentials)
- Mobile apps can be reverse-engineered
- Credentials would be exposed in app bundle
- Violates security best practices

---

### **2. Use Pooler for Backend:**
```env
# ✅ CORRECT - Use pooler for backend
DATABASE_URL="postgresql://...pooler.supabase.com:6543/postgres"

# ❌ WRONG - Don't use direct connection for app
DATABASE_URL="postgresql://...db.supabase.co:5432/postgres"
```

**Why?**
- Pooler handles connection management
- Prevents connection exhaustion
- Better for production
- Recommended by Supabase

---

### **3. Use Direct Connection for Migrations:**
When running SQL migrations in Supabase SQL Editor:
- ✅ Use direct connection (port 5432) if needed
- ✅ Or just use Supabase SQL Editor (no connection string needed)
- ✅ SQL Editor connects directly to database

---

## 🔍 **VERIFICATION**

### **Check Backend Connection:**
```bash
cd backend
npm run start

# Should see:
# ✅ Database connected successfully
# ✅ Server running on port 3000
```

### **Check Rider App Connection:**
```bash
cd apps/gatimitra-riderApp
npm start

# App should connect to backend API
# Check network tab for API calls
```

---

## 📋 **SUMMARY**

| Component | Connection Type | Port | Purpose |
|-----------|----------------|------|---------|
| **Backend .env** | Pooler | 6543 | Application runtime |
| **Rider App .env** | ❌ None | - | Only API URL needed |
| **SQL Migrations** | Direct | 5432 | Database management |
| **SQL Editor** | Direct | 5432 | Query execution |

---

## ✅ **QUICK SETUP CHECKLIST**

- [ ] Backend `.env` has pooler connection (port 6543)
- [ ] Rider App `.env` has API URL (NO database connection)
- [ ] Database password replaced in connection string
- [ ] Backend can connect to database
- [ ] Rider app can call backend API
- [ ] No database credentials in rider app

---

**Status:** ✅ **READY TO CONFIGURE**

Replace `[YOUR-PASSWORD]` with your actual Supabase database password in the backend `.env` file!
