# Purpose
Extract all Integrations that are used in workflows within a given bundle (ZIP file).

# Return Format
Return a JSON array of unique integration names (strings) used across all workflows in the bundle.

Example:
```json
["AWS", "Common", "FaaS", "IBM"]
```

# Workflow Structure

## Bundle (ZIP) Structure
```
bundle_name.zip
└── root_folder/              # Single folder on root level
    ├── workflow1.json        # Workflow definition
    ├── workflow2.json
    └── subfolder/
        └── workflow3.json
```

## Workflow JSON Structure
Each workflow is a JSON object with a `blocks` array:
```json
{
  "name": "My Workflow",
  "blocks": [
    {
      "name": "block_1",
      "action": "system/AWS/EC2/Describe EC2 Instance"
    },
    {
      "name": "block_2",
      "action": "assign",
      "value": "'foo'"
    }
  ]
}
```

# Integration Extraction Rules

## Rule 1: Block WITHOUT `action` property
**Integration:** `Common`

**Example:**
```json
{
  "name": "function_1",
  "function": "'return null;'"
}
```
**Result:** `Common`

## Rule 2: Block with Common action (no `/` in action)
**Integration:** `Common`

**Example:**
```json
{
  "name": "My_block",
  "action": "assign",
  "value": "'foo'",
  "variable": "$bar"
}
```
**Result:** `Common`

Common actions include: `assign`, `if`, `for`, `while`, `switch`, `try`, `throw`, `return`, etc.

## Rule 3: Block with Integration action (starts with `system/`)
**Integration:** Extract the segment between `system/` and the next `/`

**Format:** `system/{INTEGRATION}/{...}`

**Example:**
```json
{
  "action": "system/AWS/EC2/Describe EC2 Instance",
  "name": "My EC2 Block"
}
```
**Result:** `AWS`

**More Examples:**
- `system/IBM/Concert/Ingest Data` → `IBM`
- `system/FaaS/Execute Function` → `FaaS`
- `system/Ansible/Run Playbook` → `Ansible`

## Rule 4: Block referencing another workflow
**Integration:** Recursively extract from referenced workflow

**Conditions:**
- `action` contains `/` but does NOT start with `system/`
- Path can be relative (starts with `./`) or absolute (starts with `/`)

**Example:**
```json
{
  "action": "./UtilFlow",
  "name": "Call_Util_flow"
}
```

**Processing:**
1. If path is **absolute** (e.g., `/UserXYZ/Flow`) → Return empty array (external reference)
2. If path is **relative** (e.g., `./UtilFlow`) → Look for workflow in bundle
3. If workflow found → Extract integrations from that workflow recursively
4. If workflow NOT found → Return empty array

**Relative Path Resolution:**
- `./UtilFlow` → Look in same directory as current workflow
- `../SharedFlows/Helper` → Look in parent directory
- `subfolder/Helper` → Look in subfolder

# Algorithm

```
function extractIntegrations(bundlePath):
  integrations = new Set()
  
  1. Extract ZIP to temporary directory
  2. Find all .json files recursively
  3. For each workflow JSON file:
     a. Parse JSON
     b. Extract integrations from blocks
     c. Add to integrations set
  4. Return Array.from(integrations).sort()

function extractFromBlocks(blocks, workflowPath, allWorkflows):
  integrations = new Set()
  
  For each block in blocks:
    if block has no 'action':
      integrations.add('Common')
    
    else if action does not contain '/':
      integrations.add('Common')
    
    else if action starts with 'system/':
      integration = action.split('/')[1]
      integrations.add(integration)
    
    else if action contains '/' and not starts with 'system/':
      # Referenced workflow
      if action starts with '/':
        # Absolute path - external reference, skip
        continue
      
      else:
        # Relative path
        referencedPath = resolvePath(workflowPath, action)
        if referencedPath in allWorkflows:
          subIntegrations = extractFromBlocks(
            allWorkflows[referencedPath].blocks,
            referencedPath,
            allWorkflows
          )
          integrations.addAll(subIntegrations)
  
  return integrations
```

# Edge Cases

## Circular References
If Workflow A calls Workflow B, and Workflow B calls Workflow A:
- Track visited workflows to prevent infinite loops
- Use a Set to track currently processing workflows

## Missing Referenced Workflows
If a workflow references `./Helper` but Helper.json doesn't exist:
- Log warning
- Continue processing
- Don't add any integrations for that reference

## Nested Folders
Workflows can be in nested folders:
```
bundle/
├── main.json
└── utils/
    ├── helper.json
    └── shared/
        └── common.json
```
- Resolve relative paths correctly based on current workflow location

## Multiple Workflows in One File
Some bundles may have array of workflows in one JSON:
```json
[
  { "name": "Flow1", "blocks": [...] },
  { "name": "Flow2", "blocks": [...] }
]
```
- Process each workflow separately
- Combine all integrations

# Output Format

Return sorted, unique array of integration names:
```json
["Ansible", "AWS", "Common", "FaaS", "IBM"]
```

# Usage Example

```javascript
const integrations = await extractIntegrationsFromZip('Vulnerability Scans/bundle.zip');
console.log(integrations);
// Output: ["AWS", "Common", "FaaS", "IBM"]
