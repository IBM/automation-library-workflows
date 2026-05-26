# Purpose
Fill out the manifest.json file for a specific category with entries for all workflow bundles in that category.

# Context
- Schema for category manifest.json is defined in [`schemas/category_manifest.json`](../schemas/category_manifest.json)
- Each category is stored in a folder relative to the repository root
- Each category folder contains:
  - Multiple `.zip` files (workflow bundles)
  - One `manifest.json` file cataloging all bundles

# Category Manifest Schema

## Required Fields
```json
{
  "name": "Category Name",
  "description": "Description of what this category contains",
  "entries": [
    {
      "name": "Bundle Display Name",
      "path": "bundle_filename.zip",
      "description": "What this bundle does",
      "integrations": ["AWS", "Common", "IBM"]
    }
  ]
}
```

## Entry Fields

### Required
- **name** (string) - Display name of the workflow bundle
- **path** (string) - Relative path to the .zip file (MUST end in `.zip`)
- **description** (string) - Short description of what the bundle does
- **integrations** (array of strings) - Integration names used in the workflows

### Optional
- **tags** (array of strings) - Tag IDs for filtering (e.g., `["team:security", "use-case:vulnerability-scans"]`)
- **certified** (boolean) - Whether the bundle is IBM certified

# Tag Format

Tags follow the format: `{tag_group_id}:{tag_value_id}`

## Available Tag Groups (from root manifest.json)

### team
- `team:security` - Security team workflows
- `team:networking` - Networking team workflows
- `team:compute` - Compute team workflows
- `team:devops` - DevOps team workflows
- `team:ibm-concert` - IBM Concert specific workflows

### use-case
- `use-case:vulnerability-scans` - Vulnerability scanning workflows

# Mapping API Data to Manifest

When scraping from Automation Library API:

| API Field | Manifest Field | Notes |
|-----------|---------------|-------|
| `entry.name` | `name` | Use as-is |
| `result.name + ".zip"` | `path` | From getFlow response |
| `entry.description` | `description` | Use as-is |
| `entry.integrations` | `integrations` | Use as-is, or extract from ZIP |
| Derived from label | `tags` | Map label to tag IDs |

# Category Folder Naming

Map API labels to repository folder names:

| API Label | Repository Folder |
|-----------|------------------|
| "Vulnerability Scan" | "Vulnerability Scans" |
| "CI/CD" | "CI_CD" |
| "Compute Management" | "Compute Management" |
| "Network Management" | "Network Management" |
| "Resource Creation" | "Resource Creation" |
| "Cost Management" | "Cost Management" |
| "Example" | "Example" |
| "System Testing" | "System Testing" |
| "Observability" | "Observability" |
| "Compliance" | "Compliance" |
| "Resilience" | "Resilience" |
| "Risk" | "Risk" |
| "Vulnerability Remediation" | "Vulnerability Remediation" |
| "Certificates" | "Certificates" |

# Instructions

## 1. Create Category Folder (if needed)
```bash
mkdir "Category Name"
```

## 2. Create/Update manifest.json
Location: `{CategoryFolder}/manifest.json`

```json
{
  "name": "Vulnerability Scans",
  "description": "Flows for IBM Concert Vulnerability Scan Dimension",
  "entries": []
}
```

## 3. Add Entry for Each Bundle
For each `.zip` file in the category folder:

```json
{
  "name": "Fetch Scan files from AWS Inspector",
  "path": "Fetch_Scan_files_from_AWS_Inspector.zip",
  "description": "Generating Aws Inspector Scan, and Ingest it to IBM Concert",
  "integrations": ["AWS", "FaaS", "Common", "IBM"],
  "tags": ["team:security", "use-case:vulnerability-scans"],
  "certified": true
}
```

## 4. Verify Entry in Root Manifest
Ensure the category is listed in root [`manifest.json`](../manifest.json):

```json
{
  "categories": [
    {
      "name": "Vulnerability Scans",
      "path": "Vulnerability Scans"
    }
  ]
}
```

# Example: Complete Category Manifest

```json
{
  "name": "Vulnerability Scans",
  "description": "Flows for IBM Concert Vulnerability Scan Dimension.",
  "entries": [
    {
      "name": "Sync AWS Linux Bulletin",
      "path": "Sync_AWS_Linux_Bulletin.zip",
      "description": "Scrape Amazon Linux Security Advisory (ALAS) and populate knowledgebase",
      "integrations": ["FaaS", "Common"],
      "tags": ["team:concert", "team:security", "use-case:vulnerability-scans"]
    },
    {
      "name": "Fetch Scan files from AWS Inspector",
      "path": "Fetch_Scan_files_from_AWS_Inspector.zip",
      "description": "Generating Aws Inspector Scan, and Ingest it to IBM Concert",
      "integrations": ["AWS", "FaaS", "Common", "IBM"],
      "tags": ["team:concert", "team:security", "use-case:vulnerability-scans"]
    }
  ]
}
```

# Validation Checklist

- [ ] Category folder exists
- [ ] manifest.json exists in category folder
- [ ] All required fields present (name, description, entries)
- [ ] Each entry has required fields (name, path, description, integrations)
- [ ] All paths end with `.zip`
- [ ] All referenced .zip files exist in the folder
- [ ] Tags use correct format (`group:value`)
- [ ] Category is referenced in root manifest.json
- [ ] JSON is valid (no syntax errors)

# Common Issues

## Issue: Path doesn't end in .zip
**Fix:** Add `.zip` extension to path

## Issue: Integration array is empty
**Fix:** Extract integrations from the bundle using extract_zip_integrations

## Issue: Category not in root manifest
**Fix:** Add category entry to root manifest.json categories array

## Issue: Duplicate entries
**Fix:** Remove duplicates, keep most recent version