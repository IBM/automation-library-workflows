# Purpose
Download all available .zip files from https://automation-library.ibm.com/workflows and map them correctly to the current repository's structure. Fill out manifest.json files - both root and category. Ensure .zip file has proper structure.

# API Endpoints & Response Formats

## 1. Fetching Categories and Labels
**Endpoint:** `GET https://automation-library.ibm.com/api/getcategoriesandlabels`

**Response Format:**
```json
{
  "result": [
    {
      "Category": "Use Case",
      "Description": "Description text...",
      "Labels": [
        {
          "name": "Vulnerability Scan",
          "count": 5,
          "description": "Flows for IBM Concert Vulnerability Scan Dimension",
          "integrations": ["AWS", "Ansible", "Common", "FaaS", "IBM"]
        }
      ]
    },
    {
      "Category": "Teams",
      "Description": "Description text...",
      "Labels": [...]
    }
  ]
}
```

**Available Categories:**
- **Use Case** - Contains labels like: Resource Creation, CI/CD, Network Management, Compute Management, Cost Management, Example, System Testing, Observability, Compliance, Resilience, Risk, Vulnerability Remediation, Vulnerability Scan, Certificates
- **Teams** - Contains labels like: Security, Networking, Compute, DevOps, IBM Concert

## 2. Fetching Entries for a Category Label
**Endpoint:** `GET https://automation-library.ibm.com/api/searchAutomations?labels={{LABEL}}`

**Parameters:**
- `labels` - The label name from a category's Labels array (e.g., "Vulnerability Scan")

**Response Format:**
```json
{
  "result": [
    {
      "name": "Fetch Scan files from AWS Inspector",
      "path": "/IBM Concert/Vulnerability Scan/Fetch Scan files from AWS Inspector",
      "description": "Generating Aws Inspector Scan...",
      "integrations": ["AWS", "FaaS", "Common", "IBM"],
      "dateModified": "2024-01-15T10:30:00Z"
    }
  ]
}
```

## 3. Fetching Download URL for a Bundle
**Endpoint:** `GET https://automation-library.ibm.com/api/getFlow?name={{ENTRY_PATH}}`

**Parameters:**
- `name` - The `path` value from the search results (URL encoded)

**Response Format:**
```json
{
  "result": {
    "name": "Fetch_Scan_files_from_AWS_Inspector",
    "other_metadata": "..."
  },
  "download_url": "some-key-with-timestamp-12345678"
}
```

## 4. Downloading the ZIP File
**Endpoint:** `GET https://automation-library.ibm.com/api/flow-download?key={{DOWNLOAD_URL}}`

**Parameters:**
- `key` - The `download_url` value from getFlow response

**Important Notes:**
- The downloaded file should be saved with the name from `result.name` property + `.zip` extension
- Remove any timestamps from the filename
- The ZIP should be saved in the appropriate category folder

# ZIP Structure Requirements

## Valid Structure
```
bundle_name.zip
└── bundle_name/          # Single root folder
    ├── workflow1.json
    ├── workflow2.json
    └── subfolder/
        └── workflow3.json
```

## Invalid Structures to Fix

### Case 1: Single JSON on root level
```
bundle_name.zip
└── workflow.json         # ❌ JSON file on root
```
**Fix:** Extract, create folder with bundle name, move JSON inside, re-zip

### Case 2: Timestamp in filename
```
bundle_name_1234567890.zip  # ❌ Contains timestamp
```
**Fix:** Remove timestamp from filename

### Case 3: Multiple root folders
```
bundle_name.zip
├── folder1/              # ❌ Multiple root folders
└── folder2/
```
**Fix:** Create single root folder, move all content inside

# Mapping to Repository Structure

## Category Folder Naming
Map API label names to repository folder names:
- "Vulnerability Scan" → "Vulnerability Scans" (note the 's')
- "CI/CD" → "CI_CD" (underscore instead of slash)
- "Compute Management" → "Compute Management" (keep spaces)

## Manifest Files

### Category manifest.json
Location: `{CategoryFolder}/manifest.json`

Schema: See `schemas/category_manifest.json`

Required fields per entry:
- `name` - From API `entry.name`
- `path` - Relative path to .zip file (e.g., "bundle_name.zip")
- `description` - From API `entry.description`
- `integrations` - From API `entry.integrations`
- `tags` (optional) - Array of tag IDs (e.g., ["team:security", "use-case:vulnerability-scans"])
- `certified` (optional) - Boolean for IBM certification

### Root manifest.json
Location: `manifest.json`

Schema: See `schemas/root_manifest.json`

Ensure all categories are listed in the `categories` array with:
- `name` - Display name
- `path` - Relative path to category folder

# Workflow

1. **Scrape API** - Fetch all categories, labels, and entries
2. **Download ZIPs** - For each entry, get download URL and download file
3. **Verify Structure** - Check and fix ZIP structure issues
4. **Extract Integrations** - Parse workflows to extract integration dependencies
5. **Update Manifests** - Create/update category manifest.json files
6. **Update Root** - Ensure root manifest.json references all categories
7. **Generate Report** - Summary of downloads, fixes, and any errors

# Usage Examples

## Scrape all categories
```bash
node main.js scrape
```

## Scrape specific category
```bash
node main.js scrape "Use Case"
```

## Download bundles for a label
```bash
node main.js download "Vulnerability Scan"
