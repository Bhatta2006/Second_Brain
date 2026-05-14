# Quick Start: Folder UI

## 🚀 Get Started in 3 Steps

### 1. Rebuild Frontend
```bash
docker-compose up --build web
```

### 2. Open Application
```
http://localhost:3000
```

### 3. Create Your First Folder
1. Look at the **Sidebar** (left side)
2. Find the **"Folders"** section
3. Click **"New Folder"**
4. Enter a name, pick an emoji 📁, choose a color 🎨
5. Click **"Create"**

---

## 📚 Quick Reference

### Create Folder
```
Sidebar → "New Folder" → Name + Emoji + Color → Create
```

### Create Subfolder
```
Sidebar → Hover folder → "..." → "New subfolder" → Create
```

### Upload to Folder
```
Inbox → Upload mode → Select folder dropdown → Upload
```

### Edit Folder
```
Sidebar → Hover folder → "..." → "Rename" → Update → Save
```

### Delete Folder
```
Sidebar → Hover folder → "..." → "Delete" → Confirm
```

### View Folder Items
```
Sidebar → Click folder → Library page with filtered items
```

---

## 🎯 Key Features

### Folder Tree
- **Location**: Sidebar (collapsible section)
- **Actions**: Create, Edit, Delete, Navigate
- **Hierarchy**: Up to 3 levels deep
- **Counts**: Real-time item counts per folder

### Folder Picker
- **Location**: Upload zone, Item edit
- **Purpose**: Assign items to folders
- **Options**: All folders + "No folder (Inbox)"

### Folder Dialog
- **Emojis**: 16 options (📁📂📚📖📝💼🎯🚀💡🔬🎨🎵🎮🏠💰🌟)
- **Colors**: 8 options (Gray, Blue, Green, Yellow, Red, Purple, Pink, Teal)
- **Validation**: Name required, max depth 3

---

## 🎨 Visual Guide

### Sidebar Structure
```
SecondBrain
├── Inbox
├── Library
├── Graph
├── Search
├── Chat
└── Folders ▼
    ├── All Items
    ├── 📚 Work
    │   ├── 💼 Projects
    │   └── 📝 Notes
    ├── 🏠 Personal
    └── + New Folder
```

### Upload Flow
```
┌─────────────────────────┐
│  Upload Zone            │
├─────────────────────────┤
│  [URL] [Text] [File]    │
│                         │
│  📁 Select folder...    │ ← Folder Picker
│                         │
│  [Save]                 │
└─────────────────────────┘
```

---

## 🔍 Troubleshooting

### Folders Not Showing?
1. Check if backend is running: `http://localhost:8000/docs`
2. Check browser console for errors
3. Verify database connection
4. Try refreshing the page

### Can't Create Folder?
1. Check if name is filled
2. Verify you're not at max depth (3 levels)
3. Check for duplicate names in same parent

### Upload Not Working?
1. Verify Supabase Storage is configured
2. Check `.env` file for Supabase credentials
3. Check browser console for upload errors

---

## 📖 Documentation

- **Full Implementation**: `FOLDER_UI_IMPLEMENTATION.md`
- **Changes Summary**: `CHANGES_SUMMARY.md`
- **Component Docs**: See JSDoc in component files

---

## 🎉 You're Ready!

Start organizing your Second Brain with folders! 🧠✨
