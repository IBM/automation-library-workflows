# Workflows Public

This repository contains pre-built automation workflows for IBM Concert Workflows. All workflows are organized into categories and provided as ZIP bundles with proper manifests.

## Repository Structure

```
workflows-public/
├── manifest.json                    # Root manifest listing all categories
├── package.json                     # NPM scripts for management
├── main.js                          # Main automation script
├── Certificates/                    # Category folder
│   ├── manifest.json               # Category manifest
│   └── *.zip                       # Workflow bundles
├── Vulnerability Remediation/
│   ├── manifest.json
│   └── *.zip
└── [13 more categories...]
```

## Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Available Commands

### Download Workflows

Download all workflows from IBM Automation Library:
```bash
npm run download-all
```

Download workflows for a specific category:
```bash
npm run download "Vulnerability Remediation"
```

### Verify Repository Integrity

Verify all category manifests against local ZIP files:
```bash
npm run verify-all-categories
```

Verify a single category manifest:
```bash
npm run verify-category "Vulnerability Remediation"
```

Verify root manifest structure:
```bash
npm run verify-root
```

Verify ZIP file structure in a directory:
```bash
npm run verify "Vulnerability Remediation"
```

### Fix ZIP Structure

Fix invalid ZIP structures in a directory:
```bash
npm run fix "Vulnerability Remediation"
```

### Extract Integration Information

Extract integrations from a specific ZIP bundle:
```bash
npm run extract-integrations "Vulnerability Remediation/Apply_Amazon_Linux_Patch.zip"
```

## Adding a New Workflow Bundle

When you want to add a new workflow bundle to the repository:

### Step 1: Add the ZIP File
Place your workflow ZIP bundle in the appropriate category folder:
```bash
# Example: Adding a new workflow to Vulnerability Remediation
cp my_new_workflow.zip "Vulnerability Remediation/"
```

### Step 2: Verify ZIP Structure
Ensure the ZIP has the correct structure (single root folder):
```bash
npm run verify "Vulnerability Remediation"
```

If the ZIP structure is invalid, fix it:
```bash
npm run fix "Vulnerability Remediation"
```

### Step 3: Update Category Manifest
Verify and update the category manifest to include the new bundle:
```bash
npm run verify-category "Vulnerability Remediation"
```

This will:
- Detect the new ZIP file
- Extract integrations automatically from the workflow code
- Report if the manifest needs updating

### Step 4: Manually Update Manifest (if needed)
If the verification shows the ZIP is not in the manifest, add it manually to `Vulnerability Remediation/manifest.json`:

```json
{
  "name": "Vulnerability Remediation",
  "description": "...",
  "entries": [
    {
      "name": "My New Workflow",
      "path": "my_new_workflow.zip",
      "description": "Description of what this workflow does",
      "integrations": ["AWS", "Common", "IBM"],
      "tags": ["use-case:vulnerability-remediation"]
    }
  ]
}
```

**Note:** You can get the correct integrations list by running:
```bash
npm run extract-integrations "Vulnerability Remediation/my_new_workflow.zip"
```

### Step 5: Verify Again
Run verification again to ensure everything is correct:
```bash
npm run verify-category "Vulnerability Remediation"
```

## Updating Existing Workflow Bundles

When you update an existing workflow ZIP file:

### Step 1: Replace the ZIP
Replace the existing ZIP file with your updated version:
```bash
cp updated_workflow.zip "Vulnerability Remediation/existing_workflow.zip"
```

### Step 2: Verify ZIP Structure
```bash
npm run verify "Vulnerability Remediation"
```

### Step 3: Verify Integrations
Check if the integrations have changed:
```bash
npm run verify-category "Vulnerability Remediation"
```

This will:
- Extract integrations from the updated ZIP
- Compare with the manifest
- Report any mismatches

### Step 4: Update Manifest (if needed)
If integrations have changed, update the manifest entry:

```bash
# Get the new integrations list
npm run extract-integrations "Vulnerability Remediation/existing_workflow.zip"

# Update manifest.json with the new integrations
```

### Step 5: Verify All Categories
After making changes, verify the entire repository:
```bash
npm run verify-all-categories
npm run verify-root
```

## Workflow Bundle Requirements

All workflow ZIP bundles must follow these requirements:

### 1. ZIP Structure
Each ZIP must contain exactly **one root folder** with all workflow files inside:

✅ **Valid Structure:**
```
workflow_name.zip
└── workflow_name/
    ├── workflow_name.json
    ├── helper_workflow.json
    └── other_files...
```

❌ **Invalid Structure:**
```
workflow_name.zip
├── workflow_name.json          # Files at root level
├── helper_workflow.json
└── other_files...
```

### 2. Integration Extraction
Integrations are automatically extracted from workflow JSON files based on:
- Blocks without `action` property → `Common`
- Common actions (no `/` in action) → `Common`
- `system/{Integration}/...` actions → Extract integration name
- Relative workflow references → Recursive extraction

See [`_bob/extract_zip_integrations.md`](_bob/extract_zip_integrations.md) for detailed rules.

### 3. Manifest Format
Each category must have a `manifest.json` file:

```json
{
  "name": "Category Name",
  "description": "Category description",
  "entries": [
    {
      "name": "Workflow Name",
      "path": "workflow_name.zip",
      "description": "What this workflow does",
      "integrations": ["AWS", "Common", "IBM"],
      "tags": ["use-case:category-name"]
    }
  ]
}
```

## Troubleshooting

### ZIP Structure Issues
If verification reports invalid ZIP structure:
```bash
npm run fix "Category Name"
```

### Integration Mismatches
If verification reports integration mismatches:
1. Extract actual integrations: `npm run extract-integrations "path/to/bundle.zip"`
2. Update the manifest with the correct integrations
3. Verify again: `npm run verify-category "Category Name"`

### Missing Bundles
If verification reports missing ZIPs:
- The manifest references a ZIP file that doesn't exist
- Either add the missing ZIP or remove the entry from manifest

### Extra Bundles
If verification reports extra ZIPs:
- A ZIP file exists but is not in the manifest
- Add the bundle to the manifest following Step 4 above

## Development

### Scraping New Workflows
To fetch the latest workflows from IBM Automation Library:
```bash
npm run scrape
```

### Project Structure
- `main.js` - Main automation script with all functions
- `package.json` - NPM scripts and dependencies
- `manifest.json` - Root manifest listing all categories
- `_bob/` - Documentation and instructions
- `_bob_output/` - Cache folder (auto-created, gitignored)
- `schemas/` - JSON schemas for manifests

## Documentation

Detailed documentation is available in the `_bob/` directory:
- [`project_overview.md`](_bob/project_overview.md) - Project overview
- [`scrape_automation_library.md`](_bob/scrape_automation_library.md) - API documentation
- [`extract_zip_integrations.md`](_bob/extract_zip_integrations.md) - Integration extraction rules
- [`verify_and_fix_zip_structure.md`](_bob/verify_and_fix_zip_structure.md) - ZIP verification guide
- [`update_single_category_manifest.md`](_bob/update_single_category_manifest.md) - Category manifest schema
- [`update_root_manifest.md`](_bob/update_root_manifest.md) - Root manifest schema

## License

ISC