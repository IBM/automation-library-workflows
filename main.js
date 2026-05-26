const https = require('https');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { pipeline } = require('stream');
const streamPipeline = promisify(pipeline);
const yauzl = require('yauzl');
const yazl = require('yazl');

// Verify ZIP structure
async function verifyZipStructure(zipPath) {
    return new Promise((resolve) => {
        yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                resolve({ valid: false, error: err.message });
                return;
            }

            const entries = [];
            zipfile.readEntry();

            zipfile.on('entry', (entry) => {
                entries.push(entry.fileName);
                zipfile.readEntry();
            });

            zipfile.on('end', () => {
                // Find root folders (entries that are one level deep with trailing slash)
                const rootFolders = new Set();
                const rootFiles = [];

                entries.forEach(entry => {
                    const normalized = entry.replace(/\\/g, '/');
                    if (!normalized.includes('/')) {
                        // File at root
                        rootFiles.push(normalized);
                    } else {
                        // Extract root folder name
                        const firstSlash = normalized.indexOf('/');
                        const rootFolder = normalized.substring(0, firstSlash + 1);
                        rootFolders.add(rootFolder);
                    }
                });

                const valid = rootFolders.size === 1 && rootFiles.length === 0;
                resolve({
                    valid,
                    rootFolders: Array.from(rootFolders),
                    rootFiles,
                    entries
                });
            });
        });
    });
}

// Fix ZIP structure
async function fixZipStructure(zipPath) {
    return new Promise((resolve, reject) => {
        const zipName = path.basename(zipPath, '.zip');
        const tempZipPath = zipPath + '.tmp';

        yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                resolve({ success: false, error: err.message });
                return;
            }

            const entries = [];

            zipfile.on('entry', (entry) => {
                entries.push(entry);
                zipfile.readEntry();
            });

            zipfile.on('end', () => {
                // Now process all entries
                const newZip = new yazl.ZipFile();
                let processed = 0;

                const processNext = () => {
                    if (processed >= entries.length) {
                        // All entries processed, finalize
                        newZip.end();
                        const writeStream = fs.createWriteStream(tempZipPath);
                        newZip.outputStream.pipe(writeStream);

                        writeStream.on('close', () => {
                            try {
                                fs.unlinkSync(zipPath);
                                fs.renameSync(tempZipPath, zipPath);
                                resolve({ success: true });
                            } catch (e) {
                                resolve({ success: false, error: e.message });
                            }
                        });

                        writeStream.on('error', (e) => {
                            resolve({ success: false, error: e.message });
                        });
                        return;
                    }

                    const entry = entries[processed];
                    const oldPath = entry.fileName.replace(/\\/g, '/');
                    const newPath = `${zipName}/${oldPath}`;

                    if (/\/$/.test(entry.fileName)) {
                        // Directory entry
                        newZip.addEmptyDirectory(newPath);
                        processed++;
                        processNext();
                    } else {
                        // File entry - need to reopen to read
                        yauzl.open(zipPath, { lazyEntries: true }, (err2, zipfile2) => {
                            if (err2) {
                                resolve({ success: false, error: err2.message });
                                return;
                            }

                            let found = false;
                            zipfile2.on('entry', (e) => {
                                if (e.fileName === entry.fileName && !found) {
                                    found = true;
                                    zipfile2.openReadStream(e, (err3, readStream) => {
                                        if (err3) {
                                            resolve({ success: false, error: err3.message });
                                            return;
                                        }

                                        const chunks = [];
                                        readStream.on('data', (chunk) => chunks.push(chunk));
                                        readStream.on('end', () => {
                                            const buffer = Buffer.concat(chunks);
                                            newZip.addBuffer(buffer, newPath);
                                            processed++;
                                            zipfile2.close();
                                            processNext();
                                        });
                                        readStream.on('error', (e) => {
                                            resolve({ success: false, error: e.message });
                                        });
                                    });
                                } else {
                                    zipfile2.readEntry();
                                }
                            });

                            zipfile2.readEntry();
                        });
                    }
                };

                processNext();
            });

            zipfile.on('error', (e) => {
                resolve({ success: false, error: e.message });
            });

            zipfile.readEntry();
        });
    });
}

// Ensure _bob_output directory exists
function ensureOutputDir() {
    if (!fs.existsSync('_bob_output')) {
        fs.mkdirSync('_bob_output', { recursive: true });
    }
}

// Extract integrations from a ZIP bundle
async function extractIntegrationsFromZip(zipPath) {
    return new Promise((resolve, reject) => {
        const integrations = new Set();
        const workflows = {};

        yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                reject(err);
                return;
            }

            const entries = [];
            zipfile.readEntry();

            zipfile.on('entry', (entry) => {
                entries.push(entry);
                zipfile.readEntry();
            });

            zipfile.on('end', async () => {
                // Read all JSON files
                for (const entry of entries) {
                    if (entry.fileName.endsWith('.json')) {
                        try {
                            const content = await new Promise((res, rej) => {
                                yauzl.open(zipPath, { lazyEntries: true }, (err2, zf) => {
                                    if (err2) {
                                        rej(err2);
                                        return;
                                    }
                                    zf.readEntry();
                                    zf.on('entry', (e) => {
                                        if (e.fileName === entry.fileName) {
                                            zf.openReadStream(e, (err3, stream) => {
                                                if (err3) {
                                                    rej(err3);
                                                    return;
                                                }

                                                const chunks = [];
                                                stream.on('data', chunk => chunks.push(chunk));
                                                stream.on('end', () => {
                                                    res(Buffer.concat(chunks).toString('utf8'));
                                                    zf.close();
                                                });
                                                stream.on('error', rej);
                                            });
                                        } else {
                                            zf.readEntry();
                                        }
                                    });
                                });
                            });

                            const workflow = JSON.parse(content);
                            workflows[entry.fileName] = workflow;
                        } catch (e) {
                            // Skip invalid JSON files
                        }
                    }
                }

                // Extract integrations from all workflows
                const visited = new Set();
                for (const [filePath, workflow] of Object.entries(workflows)) {
                    extractFromWorkflow(workflow, filePath, workflows, integrations, visited);
                }

                resolve(Array.from(integrations).sort());
            });

            zipfile.on('error', reject);
        });
    });
}

function walkBlocks(blocks, integrations, workflowPath, allWorkflows, visited) {
    for (const block of blocks) {
        // Rule 1: Block without action
        if (!block.action) {
            integrations.add('Common');
            continue;
        }

        const action = block.action;
        let isMetaBlock = false;

        // Rule 2: Common action (no '/' in action)
        if (!action.includes('/')) {
            integrations.add('Common');
            isMetaBlock = true;
        }

        // Rule 3: Integration action (starts with 'system/')
        if (action.startsWith('system/')) {
            const parts = action.split('/');
            if (parts.length >= 2) {
                integrations.add(parts[1]);
            }
            continue;
        }

        if (isMetaBlock) {
            for (let entry of Object.entries(block)) {
                if (!Array.isArray(entry[1])) {
                    continue;
                }

                walkBlocks(entry[1], integrations, workflowPath, allWorkflows, visited);
            }
            continue;
        }

        // Rule 4: Referenced workflow
        if (action.includes('/') && !action.startsWith('system/')) {
            // Skip absolute paths (external references)
            if (action.startsWith('/')) {
                continue;
            }

            // Resolve relative path
            const referencedPath = resolveWorkflowPath(workflowPath, action);

            // Look for referenced workflow
            for (const [path, wf] of Object.entries(allWorkflows)) {
                if (path.endsWith(referencedPath + '.json') || path.endsWith(referencedPath)) {
                    extractFromWorkflow(wf, path, allWorkflows, integrations, visited);
                    break;
                }
            }
        }
    }
}

// Extract integrations from a workflow
function extractFromWorkflow(workflow, workflowPath, allWorkflows, integrations, visited) {
    if (visited.has(workflowPath)) {
        return; // Prevent circular references
    }
    visited.add(workflowPath);

    // Handle array of workflows
    if (Array.isArray(workflow)) {
        workflow.forEach(wf => extractFromWorkflow(wf, workflowPath, allWorkflows, integrations, visited));
        return;
    }

    if (!workflow.blocks || !Array.isArray(workflow.blocks)) {
        return;
    }

    walkBlocks(workflow.blocks, integrations, workflowPath, allWorkflows, visited)
    
}

// Resolve relative workflow path
function resolveWorkflowPath(currentPath, referencePath) {
    const currentDir = path.dirname(currentPath);
    const resolved = path.join(currentDir, referencePath);
    return resolved.replace(/\\/g, '/');
}

// Utility function to make HTTPS GET requests
function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve(data);
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        }).on('error', reject);
    });
}

// Download file from URL
async function downloadFile(url, filepath) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode === 200) {
                const fileStream = fs.createWriteStream(filepath);
                streamPipeline(res, fileStream)
                    .then(() => resolve(filepath))
                    .catch(reject);
            } else {
                reject(new Error(`HTTP ${res.statusCode}`));
            }
        }).on('error', reject);
    });
}

// Main scraping function
async function scrapeAutomationLibrary(categoryFilter = null) {
    console.log('Fetching categories and labels...');

    try {
        // Step 1: Get categories and labels
        const response = await httpsGet('https://automation-library.ibm.com/api/getcategoriesandlabels');

        // Handle response format: { result: [ { Category, Description, Labels: [] } ] }
        const categories = response.result || [];
        console.log(`Found ${categories.length} categories`);

        const results = {
            categories: {},
            downloads: [],
            errors: []
        };

        // Step 2: For each category, fetch entries
        for (const category of categories) {
            const categoryName = category.Category;
            console.log(`\nProcessing category: ${categoryName}`);

            if (categoryFilter && categoryName !== categoryFilter) {
                console.log(`  Skipping (filter: ${categoryFilter})`);
                continue;
            }

            results.categories[categoryName] = {
                description: category.Description,
                labels: category.Labels || [],
                entries: []
            };

            // Step 3: For each label in category, fetch automations
            for (const labelObj of (category.Labels || [])) {
                const label = labelObj.name;
                console.log(`  Fetching entries for label: ${label} (${labelObj.count} flows)`);

                try {
                    const searchUrl = `https://automation-library.ibm.com/api/searchAutomations?labels=${encodeURIComponent(label)}`;
                    const searchResponse = await httpsGet(searchUrl);

                    // Handle response format
                    const entries = searchResponse.result || searchResponse || [];
                    console.log(`    Found ${entries.length} entries`);

                    for (const entry of entries) {
                        // API returns capitalized field names
                        const name = entry.Name || entry.name;
                        const path = entry.Path || entry.path;
                        const description = entry.Description || entry.description || '';
                        const integrations = entry.Integrations || entry.integrations || [];
                        const dateModified = entry.LastModified || entry.dateModified;

                        if (name && path) {
                            results.categories[categoryName].entries.push({
                                name,
                                path,
                                description,
                                integrations,
                                label,
                                dateModified
                            });
                        }
                    }
                } catch (error) {
                    console.error(`    Error fetching entries for ${label}:`, error.message);
                    results.errors.push({ category: categoryName, label, error: error.message });
                }
            }
        }

        // Save results to file
        ensureOutputDir();
        const outputPath = path.join('_bob_output', 'scrape_results.json');
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

        console.log(`\n✓ Results saved to ${outputPath}`);
        console.log(`\nSummary:`);
        console.log(`  Categories processed: ${Object.keys(results.categories).length}`);
        console.log(`  Total entries found: ${Object.values(results.categories).reduce((sum, cat) => sum + cat.entries.length, 0)}`);
        console.log(`  Errors: ${results.errors.length}`);

        return results;

    } catch (error) {
        console.error('Fatal error:', error);
        throw error;
    }
}

// Download bundles for a specific label
async function downloadBundles(labelName) {
    console.log(`\nDownloading bundles for label: ${labelName}`);

    const resultsPath = path.join('_bob_output', 'scrape_results.json');
    if (!fs.existsSync(resultsPath)) {
        throw new Error('No scrape results found. Run scraping first.');
    }

    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

    // Find entries for this label across all categories
    let allEntries = [];
    for (const [categoryName, category] of Object.entries(results.categories)) {
        const labelEntries = category.entries.filter(e => e.label === labelName);
        allEntries = allEntries.concat(labelEntries);
    }

    if (allEntries.length === 0) {
        throw new Error(`No entries found for label "${labelName}"`);
    }

    console.log(`Found ${allEntries.length} entries for label "${labelName}"`);

    // Map label to folder name
    const folderMapping = {
        'Vulnerability Scan': 'Vulnerability Scans',
        'Vulnerability Remediation': 'Vulnerability Remediation',
        'CI/CD': 'CI_CD'
    };
    const categoryPath = folderMapping[labelName] || labelName;
    fs.mkdirSync(categoryPath, { recursive: true });

    const downloads = [];

    for (const entry of allEntries) {
        console.log(`  Fetching download URL for: ${entry.name}`);

        try {
            const flowUrl = `https://automation-library.ibm.com/api/getFlow?name=${encodeURIComponent(entry.path)}`;
            const flowData = await httpsGet(flowUrl);

            if (flowData.download_url) {
                // Remove timestamp from download URL
                const downloadUrl = `https://automation-library.ibm.com/api/flow-download?key=${flowData.download_url}`;

                // Use result.name for filename
                const filename = `${flowData.result.name}.zip`.replace(/:/g, '_');
                const filepath = path.join(categoryPath, filename);

                console.log(`    Downloading to: ${filepath}`);
                await downloadFile(downloadUrl, filepath);
                console.log(`    ✓ Downloaded`);

                // Verify ZIP structure
                console.log(`    Verifying ZIP structure...`);
                const verification = await verifyZipStructure(filepath);

                if (!verification.valid) {
                    console.log(`    ⚠ Invalid ZIP structure detected`);
                    console.log(`    Fixing ZIP structure...`);
                    const fix = await fixZipStructure(filepath);

                    if (fix.success) {
                        console.log(`    ✓ ZIP structure fixed`);
                    } else {
                        console.log(`    ✗ Failed to fix ZIP structure`);
                    }
                } else {
                    console.log(`    ✓ ZIP structure valid`);
                }

                downloads.push({
                    name: entry.name,
                    filename: filename,
                    path: filepath,
                    integrations: entry.integrations,
                    description: entry.description
                });
            }
        } catch (error) {
            console.error(`    Error downloading ${entry.name}:`, error.message);
        }
    }

    // Save download manifest
    ensureOutputDir();
    const manifestPath = path.join('_bob_output', `downloads_${labelName.replace(/\s+/g, '_')}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(downloads, null, 2));

    console.log(`\n✓ Downloaded ${downloads.length} bundles`);
    console.log(`✓ Manifest saved to ${manifestPath}`);

    return downloads;
}

// Verify all ZIPs in a directory
async function verifyDirectory(dirPath) {
    console.log(`\nVerifying ZIP files in: ${dirPath}`);

    if (!fs.existsSync(dirPath)) {
        throw new Error(`Directory not found: ${dirPath}`);
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.zip'));
    console.log(`Found ${files.length} ZIP files\n`);

    const results = {
        valid: [],
        invalid: [],
        errors: []
    };

    for (const file of files) {
        const zipPath = path.join(dirPath, file);
        console.log(`Checking: ${file}`);

        try {
            const verification = await verifyZipStructure(zipPath);

            if (verification.valid) {
                console.log(`  ✓ Valid - Single root folder: ${verification.rootFolders[0]}`);
                results.valid.push({ file, rootFolder: verification.rootFolders[0] });
            } else {
                console.log(`  ✗ Invalid`);
                if (verification.rootFiles.length > 0) {
                    console.log(`    - Files at root: ${verification.rootFiles.join(', ')}`);
                }
                if (verification.rootFolders.length > 1) {
                    console.log(`    - Multiple root folders: ${verification.rootFolders.join(', ')}`);
                } else if (verification.rootFolders.length === 0) {
                    console.log(`    - No root folder found`);
                }
                results.invalid.push({
                    file,
                    rootFiles: verification.rootFiles,
                    rootFolders: verification.rootFolders
                });
            }
        } catch (error) {
            console.log(`  ✗ Error: ${error.message}`);
            results.errors.push({ file, error: error.message });
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Summary:`);
    console.log(`  Valid ZIPs: ${results.valid.length}`);
    console.log(`  Invalid ZIPs: ${results.invalid.length}`);
    console.log(`  Errors: ${results.errors.length}`);
    console.log(`${'='.repeat(60)}\n`);

    return results;
}

// Fix all invalid ZIPs in a directory
async function fixDirectory(dirPath) {
    console.log(`\nFixing ZIP files in: ${dirPath}`);

    if (!fs.existsSync(dirPath)) {
        throw new Error(`Directory not found: ${dirPath}`);
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.zip'));
    console.log(`Found ${files.length} ZIP files\n`);

    const results = {
        fixed: [],
        alreadyValid: [],
        errors: []
    };

    for (const file of files) {
        const zipPath = path.join(dirPath, file);
        console.log(`Processing: ${file}`);

        try {
            // First verify
            const verification = await verifyZipStructure(zipPath);

            if (verification.valid) {
                console.log(`  ✓ Already valid - skipping`);
                results.alreadyValid.push(file);
            } else {
                console.log(`  ⚠ Invalid structure detected - fixing...`);
                const fix = await fixZipStructure(zipPath);

                if (fix.success) {
                    console.log(`  ✓ Fixed successfully`);
                    results.fixed.push(file);
                } else {
                    console.log(`  ✗ Failed to fix: ${fix.error}`);
                    results.errors.push({ file, error: fix.error });
                }
            }
        } catch (error) {
            console.log(`  ✗ Error: ${error.message}`);
            results.errors.push({ file, error: error.message });
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Summary:`);
    console.log(`  Fixed: ${results.fixed.length}`);
    console.log(`  Already valid: ${results.alreadyValid.length}`);
    console.log(`  Errors: ${results.errors.length}`);
    console.log(`${'='.repeat(60)}\n`);

    return results;
}

// Download all Use Case workflows and create manifests
async function downloadAllUseCases() {
    console.log('\n' + '='.repeat(60));
    console.log('DOWNLOADING ALL USE CASE WORKFLOWS');
    console.log('='.repeat(60) + '\n');

    // Read scrape results
    const resultsPath = path.join('_bob_output', 'scrape_results.json');
    if (!fs.existsSync(resultsPath)) {
        throw new Error('No scrape results found. Run: node main.js scrape');
    }

    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    const useCase = results.categories['Use Case'];

    if (!useCase) {
        throw new Error('No Use Case category found in scrape results');
    }

    console.log(`Found ${useCase.labels.length} Use Case labels\n`);

    const summary = {
        labels: [],
        totalDownloaded: 0,
        totalSkipped: 0,
        totalFixed: 0,
        errors: []
    };

    // Process each label
    for (const labelObj of useCase.labels) {
        const label = labelObj.name;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Processing: ${label} (${labelObj.count} workflows)`);
        console.log('='.repeat(60));

        try {
            // Map label to folder name
            const folderMapping = {
                'Vulnerability Scan': 'Vulnerability Scans',
                'Vulnerability Remediation': 'Vulnerability Remediation',
                'CI/CD': 'CI_CD'
            };
            const categoryPath = folderMapping[label] || label;

            // Create category directory
            fs.mkdirSync(categoryPath, { recursive: true });

            // Get entries for this label
            const entries = useCase.entries.filter(e => e.label === label);
            console.log(`\nFound ${entries.length} entries for ${label}`);

            let downloaded = 0;
            let skipped = 0;
            let fixed = 0;
            const categoryBundles = [];

            for (const entry of entries) {
                const filename = `${entry.name}.zip`;
                const filepath = path.join(categoryPath, filename);

                // Check if already exists
                if (fs.existsSync(filepath)) {
                    console.log(`  ⏭ Skipping ${entry.name} (already exists)`);
                    skipped++;

                    // Extract integrations from existing ZIP
                    try {
                        const integrations = await extractIntegrationsFromZip(filepath);
                        categoryBundles.push({
                            name: entry.name,
                            path: filename,
                            description: entry.description,
                            integrations: integrations,
                            tags: [`use-case:${label.toLowerCase().replace(/\s+/g, '-')}`]
                        });
                    } catch (error) {
                        console.log(`    ⚠ Could not extract integrations: ${error.message}`);
                        // Fallback to API data
                        categoryBundles.push({
                            name: entry.name,
                            path: filename,
                            description: entry.description,
                            integrations: entry.integrations || [],
                            tags: [`use-case:${label.toLowerCase().replace(/\s+/g, '-')}`]
                        });
                    }
                    continue;
                }

                console.log(`  📥 Downloading ${entry.name}...`);

                try {
                    // Get download URL
                    const flowUrl = `https://automation-library.ibm.com/api/getFlow?name=${encodeURIComponent(entry.path)}`;
                    const flowData = await httpsGet(flowUrl);

                    if (flowData.download_url) {
                        const downloadUrl = `https://automation-library.ibm.com/api/flow-download?key=${flowData.download_url}`;

                        // Download
                        await downloadFile(downloadUrl, filepath);
                        console.log(`    ✓ Downloaded`);
                        downloaded++;

                        // Verify and fix ZIP structure
                        console.log(`    🔍 Verifying ZIP structure...`);
                        const verification = await verifyZipStructure(filepath);

                        if (!verification.valid) {
                            console.log(`    ⚠ Invalid structure - fixing...`);
                            const fix = await fixZipStructure(filepath);

                            if (fix.success) {
                                console.log(`    ✓ Fixed`);
                                fixed++;
                            } else {
                                console.log(`    ✗ Fix failed: ${fix.error}`);
                            }
                        } else {
                            console.log(`    ✓ Valid structure`);
                        }

                        // Extract integrations from ZIP
                        console.log(`    🔍 Extracting integrations...`);
                        const integrations = await extractIntegrationsFromZip(filepath);
                        console.log(`    ✓ Found integrations: ${integrations.join(', ')}`);

                        // Add to category bundles
                        categoryBundles.push({
                            name: entry.name,
                            path: filename,
                            description: entry.description,
                            integrations: integrations,
                            tags: [`use-case:${label.toLowerCase().replace(/\s+/g, '-')}`]
                        });
                    }
                } catch (error) {
                    console.error(`    ✗ Error: ${error.message}`);
                    summary.errors.push({ label, entry: entry.name, error: error.message });
                }
            }

            // Create category manifest
            console.log(`\n📝 Creating manifest for ${label}...`);
            const manifest = {
                $schema: "../schemas/category_manifest.json",
                name: label,
                description: labelObj.description,
                bundles: categoryBundles
            };

            const manifestPath = path.join(categoryPath, 'manifest.json');
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            console.log(`  ✓ Manifest created: ${manifestPath}`);

            summary.labels.push({
                name: label,
                path: categoryPath,
                downloaded,
                skipped,
                fixed,
                total: entries.length
            });

            summary.totalDownloaded += downloaded;
            summary.totalSkipped += skipped;
            summary.totalFixed += fixed;

        } catch (error) {
            console.error(`\n✗ Error processing ${label}: ${error.message}`);
            summary.errors.push({ label, error: error.message });
        }
    }

    // Update root manifest
    console.log(`\n${'='.repeat(60)}`);
    console.log('UPDATING ROOT MANIFEST');
    console.log('='.repeat(60) + '\n');

    try {
        const rootManifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

        // Update categories - ensure all labels are present
        const existingCategories = new Set(rootManifest.categories.map(c => c.name));

        for (const labelSummary of summary.labels) {
            if (!existingCategories.has(labelSummary.name)) {
                console.log(`  + Adding category: ${labelSummary.name}`);
                rootManifest.categories.push({
                    name: labelSummary.name,
                    path: labelSummary.path
                });
            }
        }

        // Sort categories alphabetically
        rootManifest.categories.sort((a, b) => a.name.localeCompare(b.name));

        // Save updated root manifest
        fs.writeFileSync('manifest.json', JSON.stringify(rootManifest, null, '\t'));
        console.log(`\n✓ Root manifest updated`);

    } catch (error) {
        console.error(`\n✗ Error updating root manifest: ${error.message}`);
        summary.errors.push({ task: 'update_root_manifest', error: error.message });
    }

    // Print summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('SUMMARY');
    console.log('='.repeat(60) + '\n');
    console.log(`Labels processed: ${summary.labels.length}`);
    console.log(`Total downloaded: ${summary.totalDownloaded}`);
    console.log(`Total skipped: ${summary.totalSkipped}`);
    console.log(`Total fixed: ${summary.totalFixed}`);
    console.log(`Errors: ${summary.errors.length}\n`);

    if (summary.errors.length > 0) {
        console.log('Errors:');
        summary.errors.forEach(e => {
            console.log(`  - ${e.label || e.task}: ${e.error}`);
        });
    }

    // Save summary
    ensureOutputDir();
    const summaryPath = path.join('_bob_output', 'download_all_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`\n✓ Summary saved to ${summaryPath}`);

    return summary;
}

// Verify category manifest against local ZIPs
async function verifyCategoryManifest(categoryPath) {
    console.log(`\nVerifying category manifest: ${categoryPath}`);

    const manifestPath = path.join(categoryPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Manifest not found: ${manifestPath}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`Category: ${manifest.name}`);
    console.log(`Bundles in manifest: ${manifest.entries.length}\n`);

    const results = {
        valid: [],
        missing: [],
        extra: [],
        integrationMismatches: []
    };

    // Get all ZIP files in directory
    const zipFiles = fs.readdirSync(categoryPath)
        .filter(f => f.endsWith('.zip'))
        .map(f => f);

    // Check each bundle in manifest
    for (const bundle of manifest.entries) {
        const zipPath = path.join(categoryPath, bundle.path);

        if (!fs.existsSync(zipPath)) {
            console.log(`✗ Missing: ${bundle.path}`);
            results.missing.push(bundle.path);
            continue;
        }

        // Extract integrations from ZIP
        try {
            const actualIntegrations = await extractIntegrationsFromZip(zipPath);
            const manifestIntegrations = bundle.integrations || [];

            // Compare integrations
            const actualSet = new Set(actualIntegrations);
            const manifestSet = new Set(manifestIntegrations);

            const missing = manifestIntegrations.filter(i => !actualSet.has(i));
            const extra = actualIntegrations.filter(i => !manifestSet.has(i));

            if (missing.length > 0 || extra.length > 0) {
                console.log(`⚠ Integration mismatch: ${bundle.path}`);
                if (missing.length > 0) {
                    console.log(`  Missing in ZIP: ${missing.join(', ')}`);
                }
                if (extra.length > 0) {
                    console.log(`  Extra in ZIP: ${extra.join(', ')}`);
                }
                results.integrationMismatches.push({
                    bundle: bundle.path,
                    missing,
                    extra,
                    manifest: manifestIntegrations,
                    actual: actualIntegrations
                });

                bundle.integrations = Array.from(actualSet);
            } else {
                console.log(`✓ Valid: ${bundle.path}`);
                results.valid.push(bundle.path);
            }
        } catch (error) {
            console.log(`✗ Error extracting integrations from ${bundle.path}: ${error.message}`);
            results.integrationMismatches.push({
                bundle: bundle.path,
                error: error.message
            });
        }
    }

    // Check for ZIPs not in manifest
    const manifestPaths = new Set(manifest.entries.map(b => b.path));
    for (const zipFile of zipFiles) {
        if (!manifestPaths.has(zipFile)) {
            console.log(`⚠ Extra ZIP not in manifest: ${zipFile}`);
            results.extra.push(zipFile);
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('Summary:');
    console.log(`  Valid: ${results.valid.length}`);
    console.log(`  Missing ZIPs: ${results.missing.length}`);
    console.log(`  Extra ZIPs: ${results.extra.length}`);
    console.log(`  Integration mismatches: ${results.integrationMismatches.length}`);
    console.log(`${'='.repeat(60)}\n`);

    // Remove missing zips from manifest.entries
    manifest.entries = manifest.entries.filter(e => results.missing.indexOf(e.path) === -1);

    // Add newly added zips to manifest
    await addZipToManifest(categoryPath, results.extra, manifest.entries);

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), null);

    return results;
}

async function addZipToManifest(categoryPath, extraZips, targetArr) {
    if (!extraZips?.length) {
        return;
    }

    console.log(`Adding missing zips to ${categoryPath}`);
    for (const zip of extraZips) {
        const zipPath = path.join(categoryPath, zip);

        if (!fs.existsSync(zipPath)) {
            console.log(`✗ Missing: ${zip}`);
            continue;
        }

        // Extract integrations from ZIP
        try {
            const actualIntegrations = await extractIntegrationsFromZip(zipPath);
            const actualSet = new Set(actualIntegrations);

            targetArr.push({
                name: zip.replace('.zip', '').replace(/_/g, ' '),
                path: zip,
                description: '',
                integrations: Array.from(actualSet),
                tags: []
            })
        } catch (error) {
            console.log(`✗ Error extracting integrations from ${zip}: ${error.message}`);
        }
    }
}

// Verify all category manifests
async function verifyAllCategoryManifests() {
    console.log('\n' + '='.repeat(60));
    console.log('VERIFYING ALL CATEGORY MANIFESTS');
    console.log('='.repeat(60) + '\n');

    const rootManifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    const allResults = {};

    for (const category of rootManifest.categories) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Category: ${category.name}`);
        console.log('='.repeat(60));

        try {
            const results = await verifyCategoryManifest(category.path);
            allResults[category.name] = results;
        } catch (error) {
            console.error(`Error verifying ${category.name}: ${error.message}`);
            allResults[category.name] = { error: error.message };
        }
    }

    // Overall summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('OVERALL SUMMARY');
    console.log('='.repeat(60) + '\n');

    let totalValid = 0;
    let totalMissing = 0;
    let totalExtra = 0;
    let totalMismatches = 0;

    for (const [name, results] of Object.entries(allResults)) {
        if (results.error) {
            console.log(`${name}: ERROR`);
        } else {
            totalValid += results.valid.length;
            totalMissing += results.missing.length;
            totalExtra += results.extra.length;
            totalMismatches += results.integrationMismatches.length;
            console.log(`${name}: ${results.valid.length} valid, ${results.missing.length} missing, ${results.extra.length} extra, ${results.integrationMismatches.length} mismatches`);
        }
    }

    console.log(`\nTotal Valid: ${totalValid}`);
    console.log(`Total Missing: ${totalMissing}`);
    console.log(`Total Extra: ${totalExtra}`);
    console.log(`Total Mismatches: ${totalMismatches}\n`);

    return allResults;
}

// Verify root manifest
async function verifyRootManifest() {
    console.log('\n' + '='.repeat(60));
    console.log('VERIFYING ROOT MANIFEST');
    console.log('='.repeat(60) + '\n');

    const rootManifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    const results = {
        valid: [],
        missingDirs: [],
        missingManifests: [],
        extraDirs: []
    };

    console.log(`Root manifest: ${rootManifest.name}`);
    console.log(`Categories: ${rootManifest.categories.length}\n`);

    // Check each category in root manifest
    for (const category of rootManifest.categories) {
        const categoryPath = category.path;
        const manifestPath = path.join(categoryPath, 'manifest.json');

        if (!fs.existsSync(categoryPath)) {
            console.log(`✗ Missing directory: ${categoryPath}`);
            results.missingDirs.push(categoryPath);
        } else if (!fs.existsSync(manifestPath)) {
            console.log(`✗ Missing manifest: ${manifestPath}`);
            results.missingManifests.push(categoryPath);
        } else {
            console.log(`✓ Valid: ${category.name} (${categoryPath})`);
            results.valid.push(category.name);
        }
    }

    // Check for directories not in root manifest
    const manifestPaths = new Set(rootManifest.categories.map(c => c.path));
    const allDirs = fs.readdirSync('.')
        .filter(f => {
            const stat = fs.statSync(f);
            return stat.isDirectory() && !f.startsWith('.') && !f.startsWith('_') && f !== 'node_modules' && f !== 'schemas';
        });

    for (const dir of allDirs) {
        if (!manifestPaths.has(dir) && fs.existsSync(path.join(dir, 'manifest.json'))) {
            console.log(`⚠ Extra category directory not in root manifest: ${dir}`);
            results.extraDirs.push(dir);
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('Summary:');
    console.log(`  Valid categories: ${results.valid.length}`);
    console.log(`  Missing directories: ${results.missingDirs.length}`);
    console.log(`  Missing manifests: ${results.missingManifests.length}`);
    console.log(`  Extra directories: ${results.extraDirs.length}`);
    console.log(`${'='.repeat(60)}\n`);

    return results;
}

// Add $schema to all category manifests
async function addSchemaToManifests() {
    console.log('\nAdding $schema to all category manifests...\n');

    const rootManifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    let updated = 0;
    let skipped = 0;

    for (const category of rootManifest.categories) {
        const manifestPath = path.join(category.path, 'manifest.json');

        if (!fs.existsSync(manifestPath)) {
            console.log(`⏭ Skipping ${category.name} - manifest not found`);
            skipped++;
            continue;
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        if (manifest.$schema) {
            console.log(`⏭ Skipping ${category.name} - already has $schema`);
            skipped++;
            continue;
        }

        // Add $schema as first property
        const updatedManifest = {
            $schema: "../schemas/category_manifest.json",
            ...manifest
        };

        fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2));
        console.log(`✓ Updated ${category.name}`);
        updated++;
    }

    console.log(`\nSummary:`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped: ${skipped}\n`);
}

// CLI interface
const args = process.argv.slice(2);
const command = args[0];
const param = args[1];

if (command === 'scrape') {
    scrapeAutomationLibrary(param).catch(console.error);
} else if (command === 'download') {
    if (!param) {
        console.error('Usage: node main.js download <category-name>');
        process.exit(1);
    }
    downloadBundles(param).catch(console.error);
} else if (command === 'verify') {
    if (!param) {
        console.error('Usage: node main.js verify <directory-path>');
        process.exit(1);
    }
    verifyDirectory(param).catch(console.error);
} else if (command === 'fix') {
    if (!param) {
        console.error('Usage: node main.js fix <directory-path>');
        process.exit(1);
    }
    fixDirectory(param).catch(console.error);
} else if (command === 'download-all') {
    downloadAllUseCases().catch(console.error);
} else if (command === 'extract-integrations') {
    if (!param) {
        console.error('Usage: node main.js extract-integrations <zip-path>');
        process.exit(1);
    }
    extractIntegrationsFromZip(param)
        .then(integrations => {
            console.log(JSON.stringify(integrations, null, 2));
        })
        .catch(console.error);
} else if (command === 'verify-category') {
    if (!param) {
        console.error('Usage: node main.js verify-category <category-path>');
        process.exit(1);
    }
    verifyCategoryManifest(param).catch(console.error);
} else if (command === 'verify-all-categories') {
    verifyAllCategoryManifests().catch(console.error);
} else if (command === 'verify-root') {
    verifyRootManifest().catch(console.error);
} else if (command === 'add-schemas') {
    addSchemaToManifests().catch(console.error);
} else {
    console.log('Usage:');
    console.log('  node main.js scrape [category-name]          - Scrape automation library');
    console.log('  node main.js download <category-name>        - Download bundles for category');
    console.log('  node main.js download-all                    - Download all Use Case workflows and create manifests');
    console.log('  node main.js verify <directory-path>         - Verify ZIP structure in directory');
    console.log('  node main.js fix <directory-path>            - Fix invalid ZIP structures in directory');
    console.log('  node main.js extract-integrations <zip-path> - Extract integrations from a ZIP bundle');
    console.log('  node main.js verify-category <category-path> - Verify category manifest against local ZIPs');
    console.log('  node main.js verify-all-categories           - Verify all category manifests');
    console.log('  node main.js verify-root                     - Verify root manifest');
    console.log('  node main.js add-schemas                     - Add $schema property to all category manifests');
}

// Made with Bob
