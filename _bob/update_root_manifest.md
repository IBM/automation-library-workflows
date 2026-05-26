# Purpose
Maintain the root manifest.json to catalog all workflow categories and define the tag taxonomy for filtering.

# Context
- Schema for root manifest.json is defined in [`schemas/root_manifest.json`](../schemas/root_manifest.json)
- Location: [`manifest.json`](../manifest.json) (repository root)
- This file serves as the entry point for discovering all workflow categories

# Root Manifest Schema

## Structure
```json
{
  "name": "Concert workflows",
  "description": "Ready-to-use Workflows used in Concert Workflows",
  "categories": [],
  "bundles": [],
  "tagDefinitions": []
}
```

## Required Fields

### name (string)
Display name for the entire workflow collection
```json
"name": "Concert workflows"
```

### description (string)
Description of what this workflow collection contains
```json
"description": "Ready-to-use Workflows used in Concert Workflows"
```

### categories (array)
List of all workflow categories in the repository

**Category Object:**
```json
{
  "name": "Vulnerability Scans",
  "path": "Vulnerability Scans"
}
```

- **name** - Display name for the category
- **path** - Relative path to the category folder (contains manifest.json)

### bundles (array)
List of external bundle manifests (currently empty, reserved for future use)

**Bundle Object:**
```json
{
  "path": "https://external-repo.com/manifest.json",
  "tags": ["team:external"]
}
```

### tagDefinitions (array)
Defines the tag taxonomy for filtering workflows

**Tag Definition Object:**
```json
{
  "id": "team",
  "name": "Team",
  "description": "Workflows best suited for a department",
  "values": [
    {
      "id": "team:security",
      "name": "Security",
      "description": "Security team workflows"
    }
  ]
}
```

# Current Tag Definitions

## Tag Group: team
**ID:** `team`
**Description:** Workflows that are best suited for a respective department in your organization.

### Values:
- `team:security` - Security team workflows
- `team:networking` - Networking team workflows  
- `team:compute` - Compute team workflows
- `team:devops` - DevOps team workflows
- `team:ibm-concert` - IBM Concert specific workflows

## Tag Group: use-case
**ID:** `use-case`
**Description:** Filter workflows that are best suited for a specific use case.

### Values:
- `use-case:vulnerability-scans` - Vulnerability scanning workflows

# Category Management

## Adding a New Category

1. **Create category folder** with appropriate name
2. **Add entry to categories array:**
```json
{
  "name": "New Category",
  "path": "New Category"
}
```

3. **Maintain alphabetical order** (optional but recommended)

## Removing a Category

1. **Remove entry from categories array**
2. **Verify no workflows reference this category**
3. **Archive or delete the category folder**

## Renaming a Category

1. **Rename the folder**
2. **Update the path in categories array**
3. **Keep the name field for display purposes**

# Tag Management

## Adding a New Tag Group

```json
{
  "id": "priority",
  "name": "Priority",
  "description": "Workflow priority level",
  "values": [
    {
      "id": "priority:high",
      "name": "High Priority",
      "description": "Critical workflows"
    },
    {
      "id": "priority:medium",
      "name": "Medium Priority",
      "description": "Standard workflows"
    }
  ]
}
```

## Adding a New Tag Value

Add to the `values` array of existing tag group:
```json
{
  "id": "team:finance",
  "name": "Finance",
  "description": "Finance team workflows"
}
```

# Complete Example

```json
{
  "name": "Concert workflows",
  "description": "Ready-to-use Workflows used in Concert Workflows",
  "categories": [
    {
      "name": "CI/CD",
      "path": "CI_CD"
    },
    {
      "name": "Compliance",
      "path": "Compliance"
    },
    {
      "name": "Vulnerability Scans",
      "path": "Vulnerability Scans"
    }
  ],
  "bundles": [],
  "tagDefinitions": [
    {
      "id": "team",
      "name": "Team",
      "description": "Workflows for specific teams",
      "values": [
        {
          "id": "team:security",
          "name": "Security",
          "description": "Security team workflows"
        }
      ]
    },
    {
      "id": "use-case",
      "name": "Use case",
      "description": "Workflows for specific use cases",
      "values": [
        {
          "id": "use-case:vulnerability-scans",
          "name": "Vulnerability Scans",
          "description": "Vulnerability scanning workflows"
        }
      ]
    }
  ]
}
```

# Validation Checklist

- [ ] All required fields present (name, description, categories, bundles, tagDefinitions)
- [ ] Each category has name and path
- [ ] All category paths point to existing folders
- [ ] Each category folder contains a manifest.json
- [ ] Tag IDs follow format: `{group}:{value}`
- [ ] Tag value IDs start with their group ID
- [ ] No duplicate category names or paths
- [ ] No duplicate tag IDs
- [ ] JSON is valid (no syntax errors)

# Common Operations

## Sync Categories from Filesystem

Scan repository for category folders and ensure all are in manifest:
```javascript
const fs = require('fs');
const categories = fs.readdirSync('.')
  .filter(f => fs.statSync(f).isDirectory())
  .filter(f => fs.existsSync(`${f}/manifest.json`))
  .map(f => ({ name: f, path: f }));
```

## Verify Category References

Ensure all categories in manifest have corresponding folders:
```javascript
for (const category of manifest.categories) {
  if (!fs.existsSync(category.path)) {
    console.error(`Missing folder: ${category.path}`);
  }
  if (!fs.existsSync(`${category.path}/manifest.json`)) {
    console.error(`Missing manifest: ${category.path}/manifest.json`);
  }
}
```

# Relationship with Category Manifests

```
manifest.json (root)
├── categories[0] → "Vulnerability Scans/"
│   └── manifest.json (category)
│       └── entries[] → *.zip files
├── categories[1] → "CI_CD/"
│   └── manifest.json (category)
│       └── entries[] → *.zip files
└── tagDefinitions[] (used by all category entries)
```

Each category manifest references tags defined in root manifest.