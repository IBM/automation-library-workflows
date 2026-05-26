# ZIP Structure Verification and Remediation

## Overview

All workflow bundle ZIP files in this repository must follow a specific structure: **they must contain exactly one root folder**, with all workflow files contained within that folder. This ensures consistency and proper extraction behavior.

## ZIP Structure Requirements

### Valid Structure ✓
```
workflow_name.zip
└── workflow_name/
    ├── workflow_name.json
    ├── helper_workflow.json
    └── other_files...
```

### Invalid Structures ✗

**Files at root level:**
```
workflow_name.zip
├── workflow_name.json          ❌ Files should be in a folder
├── helper_workflow.json        ❌
└── other_files...              ❌
```

**Multiple root folders:**
```
workflow_name.zip
├── folder1/                    ❌ Only one root folder allowed
│   └── workflow1.json
└── folder2/                    ❌
    └── workflow2.json
```

## Verification Command

To verify ZIP structure in a directory:

```bash
node main.js verify <directory-path>
```

### Example
```bash
node main.js verify "Vulnerability Remediation"
```

### Output
The verification command will:
- Check each ZIP file in the specified directory
- Report whether each ZIP has valid structure
- List any files at root level (invalid)
- List multiple root folders if present (invalid)
- Provide a summary of valid/invalid/error counts

### Sample Output
```
Verifying ZIP files in: Vulnerability Remediation
Found 25 ZIP files

Checking: Apply_Amazon_Linux_Patch.zip
  ✓ Valid - Single root folder: Apply_Amazon_Linux_Patch/

Checking: eks_cluster_upgrade.zip
  ✗ Invalid
    - Files at root: eks_cluster_upgrade.json, eks_nodegroup_upgrade.json
    - No root folder found

============================================================
Summary:
  Valid ZIPs: 1
  Invalid ZIPs: 24
  Errors: 0
============================================================
```

## Remediation Command

To automatically fix invalid ZIP structures:

```bash
node main.js fix <directory-path>
```

### Example
```bash
node main.js fix "Vulnerability Remediation"
```

### What It Does
The fix command will:
1. Verify each ZIP file's structure
2. Skip ZIPs that are already valid
3. For invalid ZIPs:
   - Create a new ZIP with proper structure
   - Move all files into a single root folder (named after the ZIP file)
   - Replace the original ZIP with the fixed version
4. Report success/failure for each file

### Sample Output
```
Fixing ZIP files in: Vulnerability Remediation
Found 25 ZIP files

Processing: Apply_Amazon_Linux_Patch.zip
  ⚠ Invalid structure detected - fixing...
  ✓ Fixed successfully

Processing: eks_cluster_upgrade.zip
  ✓ Already valid - skipping

============================================================
Summary:
  Fixed: 24
  Already valid: 1
  Errors: 0
============================================================
```

## Implementation Details

### Technology Stack
- **Node.js**: Cross-platform JavaScript runtime
- **yauzl**: ZIP file reading library
- **yazl**: ZIP file writing library

### Key Functions

#### `verifyZipStructure(zipPath)`
- Opens and reads ZIP file entries
- Analyzes root-level structure
- Returns validation result with details

#### `fixZipStructure(zipPath)`
- Reads all entries from invalid ZIP
- Creates new ZIP with proper structure
- Wraps all content in single root folder
- Replaces original file atomically

#### `verifyDirectory(dirPath)`
- Scans directory for ZIP files
- Verifies each ZIP's structure
- Generates comprehensive report

#### `fixDirectory(dirPath)`
- Scans directory for ZIP files
- Fixes all invalid ZIPs
- Skips already-valid ZIPs
- Generates fix report

## Workflow Integration

The verification and fixing steps are automatically integrated into the download workflow:

```javascript
// In downloadBundles() function
await downloadFile(downloadUrl, filepath);

// Automatic verification
const verification = await verifyZipStructure(filepath);

if (!verification.valid) {
    // Automatic fixing
    const fix = await fixZipStructure(filepath);
}
```

This ensures all downloaded bundles have correct structure immediately.

## Common Use Cases

### 1. Verify New Downloads
After downloading workflows from the IBM Automation Library:
```bash
node main.js verify "Vulnerability Remediation"
```

### 2. Fix Invalid ZIPs
If verification shows invalid ZIPs:
```bash
node main.js fix "Vulnerability Remediation"
```

### 3. Re-verify After Fixing
Confirm all ZIPs are now valid:
```bash
node main.js verify "Vulnerability Remediation"
```

### 4. Verify All Categories
Check multiple categories:
```bash
node main.js verify "Vulnerability Scans"
node main.js verify "CI_CD"
node main.js verify "Compliance"
```

## Troubleshooting

### Error: Directory not found
- Ensure the directory path is correct
- Use quotes around paths with spaces
- Path is relative to project root

### Error: Cannot read ZIP file
- ZIP file may be corrupted
- Re-download the workflow bundle
- Check file permissions

### Fix command fails
- Ensure you have write permissions
- Check available disk space
- Verify ZIP file is not in use by another process

## Best Practices

1. **Always verify before fixing**: Run verification first to see what needs fixing
2. **Backup important ZIPs**: Though the fix is atomic, backups are good practice
3. **Verify after fixing**: Confirm all ZIPs are valid after remediation
4. **Integrate into workflow**: Use automatic verification in download scripts
5. **Document exceptions**: If a ZIP must have different structure, document why

## Related Documentation

- [`scrape_automation_library.md`](scrape_automation_library.md) - Downloading workflows
- [`extract_zip_integrations.md`](extract_zip_integrations.md) - Extracting integration info
- [`update_single_category_manifest.md`](update_single_category_manifest.md) - Creating manifests