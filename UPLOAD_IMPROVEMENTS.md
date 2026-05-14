# Upload & Folder Creation Improvements

## Issues Fixed

### 1. Folder Creation Dialog Not Closing ✅
**Problem:** When creating a new folder, the dialog remained open after clicking "Create" button.

**Solution:** Added `setDialogOpen(false)` to the `handleSubmitFolder` function in `Sidebar.tsx` after successfully creating or updating a folder.

**File Changed:** `apps/web/src/components/nav/Sidebar.tsx`

```typescript
async function handleSubmitFolder(data: { name: string; emoji: string; color: string }) {
  try {
    if (editingFolder) {
      await foldersApi.update(editingFolder.id, data);
    } else {
      await foldersApi.create({ ...data, parent_id: parentId });
    }
    queryClient.invalidateQueries({ queryKey: ["folders"] });
    setDialogOpen(false); // ← Added this line
  } catch (err) {
    alert(err instanceof Error ? err.message : "Failed to save folder");
  }
}
```

---

### 2. Custom Naming for Uploads ✅
**Problem:** No way to provide custom names for uploaded files, URLs, or text snippets.

**Solution:** Added a "Name (optional)" input field to the upload form with smart auto-detection:

#### Features Added:
- **Custom Name Input Field**: New text input that appears for all upload types
- **Auto-Detection**: Shows preview of auto-detected name in placeholder
  - **Files**: Extracts filename without extension (e.g., "document.pdf" → "document")
  - **URLs**: Extracts meaningful part from URL path or hostname
  - **Text**: Shows first 50 characters as preview
- **Auto-Population**: For files, automatically fills the input with the filename (without extension)
- **Metadata Storage**: Custom name is stored in the `metadata.custom_name` field
- **State Management**: Custom name is cleared when switching between upload modes

**File Changed:** `apps/web/src/components/upload/UploadZone.tsx`

#### Key Changes:

1. **Added State:**
```typescript
const [customName, setCustomName] = useState("");
```

2. **Auto-Name Detection Function:**
```typescript
function getAutoName(): string {
  if (mode === "file" && file) {
    return file.name.replace(/\.[^/.]+$/, "");
  } else if (mode === "url" && value) {
    try {
      const url = new URL(value);
      const pathname = url.pathname.split('/').filter(Boolean).pop() || url.hostname;
      return pathname.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    } catch {
      return "";
    }
  } else if (mode === "text" && value) {
    return value.trim().substring(0, 50).replace(/\s+/g, " ");
  }
  return "";
}
```

3. **UI Component:**
```typescript
<div>
  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
    Name (optional)
  </label>
  <input
    type="text"
    placeholder={getAutoName() || "Will be auto-detected"}
    value={customName}
    onChange={(e) => setCustomName(e.target.value)}
    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
  />
  <p className="text-xs text-muted-foreground mt-1">
    {mode === "file" 
      ? "Give this file a custom name, or leave blank to use the filename" 
      : mode === "url"
      ? "Give this URL a custom name, or leave blank to use the page title"
      : "Give this text a custom name, or leave blank to auto-generate"}
  </p>
</div>
```

4. **Metadata Integration:**
```typescript
const itemName = customName.trim() || undefined;

// Added to all ingest calls:
metadata: {
  custom_name: itemName,
  // ... other metadata
}
```

---

## User Experience Improvements

### Before:
- ❌ Folder dialog stayed open after creation
- ❌ No way to name uploads
- ❌ Files always used their original filename
- ❌ URLs had no custom naming option

### After:
- ✅ Folder dialog closes automatically after creation
- ✅ Custom name input for all upload types
- ✅ Smart auto-detection shows preview of detected name
- ✅ Files auto-populate with clean filename (no extension)
- ✅ Optional - leave blank to use auto-detected name
- ✅ Clear helper text explains behavior for each mode

---

## Backend Compatibility

The custom name is stored in the `metadata` field as `custom_name`. The backend can use this value to:
1. Override the auto-detected title
2. Display as the primary name in the UI
3. Use for search indexing
4. Show in item details

**Note:** Backend changes may be needed to prioritize `metadata.custom_name` over auto-detected titles in the AI processing pipeline.

---

## Testing Checklist

- [ ] Create a new folder - dialog should close automatically
- [ ] Upload a file - name field should auto-populate with filename (no extension)
- [ ] Upload a URL - placeholder should show extracted URL name
- [ ] Upload text - placeholder should show first 50 chars
- [ ] Provide custom name - should be stored in metadata
- [ ] Leave name blank - should use auto-detection
- [ ] Switch between modes - custom name should clear
- [ ] Submit form - custom name should be sent to backend
